import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import type { DateRange } from "@/lib/date-range-presets";
import { vnEndOfDay, vnStartOfDay } from "@/lib/vn-time";
import type { TaskType } from "@/types/database";

export interface OrderToHandle {
  id: string;
  orderCode: string;
  customerName: string;
  branchName: string;
  actionDate: string;
}

export interface OrdersToHandleResult {
  upcomingDeliveries: OrderToHandle[];
  pendingCollections: OrderToHandle[];
  lateDeliveriesCount: number;
  lateCollectionsCount: number;
}

const CHOT_DON_INDEX = TASK_TYPE_SEQUENCE.indexOf("chot_don");
const GIAO_HANG_INDEX = TASK_TYPE_SEQUENCE.indexOf("giao_hang_ban_giao");
const VAN_HANH_INDEX = TASK_TYPE_SEQUENCE.indexOf("van_hanh_xu_ly_su_co");
const THU_HOI_INDEX = TASK_TYPE_SEQUENCE.indexOf("thu_hoi");

function statusIndex(status: TaskType) {
  return TASK_TYPE_SEQUENCE.indexOf(status);
}

// range.start/end là "YYYY-MM-DD" (biên bao gồm cả 2 đầu, theo đúng quy ước
// của computeDateRange) — actionDate là timestamptz, so theo mốc ngày giờ.
// Dùng offset +07:00 tường minh (vnStartOfDay/vnEndOfDay) — chuỗi
// "...T00:00:00" không offset bị ECMAScript hiểu theo GIỜ RUNTIME (UTC trên
// Cloudflare Workers), không phải giờ VN.
function isWithinDateRange(actionDate: string, range: DateRange | null): boolean {
  if (!range) return true;
  const date = new Date(actionDate);
  const start = vnStartOfDay(range.start);
  const end = vnEndOfDay(range.end);
  return date >= start && date <= end;
}

// Học theo Booqable: đơn đã trễ hẹn (giao/thu hồi) bị ẩn khỏi danh sách
// chính cho đỡ rối, chỉ hiện khi bấm nút "Trễ hạn (N)" — xem lateOnly bên
// dưới.
function isLate(actionDate: string, now: Date): boolean {
  return new Date(actionDate) < now;
}

// "Đơn hàng sắp tới" (cần giao) — hiện ngay khi đã Chốt đơn xong, cho đến khi
// Giao hàng & bàn giao xong thì thôi. "Đơn hàng cần thu hồi" — hiện khi đã
// Vận hành/xử lý sự cố xong, cho đến khi Thu hồi xong. Dùng orders.status
// (= khâu sớm nhất chưa hoàn thành, tự đồng bộ qua trigger) để suy ra khâu
// nào đã/chưa xong mà không cần join order_tasks.
//
// branchId = null nghĩa là không lọc theo chi nhánh (dùng cho Admin/Kế toán —
// xem tất cả kho); branchId cụ thể chỉ trả về việc của đúng chi nhánh đó (nhân
// viên kỹ thuật/quản lý chi nhánh — chỉ thấy kho mình): đơn GIAO tại chi nhánh
// mình vào danh sách sắp giao, đơn THU HỒI về chi nhánh mình vào danh sách cần
// thu hồi — 2 chi nhánh của đơn có thể khác nhau.
export async function getOrdersToHandle(
  branchId: string | null,
  limit?: number,
  options?: {
    delivery?: DateRange | null;
    collection?: DateRange | null;
    lateOnly?: { delivery?: boolean; collection?: boolean };
  },
): Promise<OrdersToHandleResult> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, order_code, customer_id, pickup_branch_id, return_branch_id, status, rental_start_at, rental_end_at",
    )
    .is("completed_at", null)
    .is("cancelled_at", null);
  if (branchId) {
    query = query.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
  }
  const { data: orders } = await query;

  const orderList = orders ?? [];
  if (!orderList.length)
    return {
      upcomingDeliveries: [],
      pendingCollections: [],
      lateDeliveriesCount: 0,
      lateCollectionsCount: 0,
    };

  const customerIds = [...new Set(orderList.map((o) => o.customer_id))];
  const branchIds = [...new Set(orderList.flatMap((o) => [o.pickup_branch_id, o.return_branch_id]))];
  const [{ data: customers }, { data: branches }] = await Promise.all([
    supabase.from("customers").select("id, name").in("id", customerIds),
    supabase.from("branches").select("id, name").in("id", branchIds),
  ]);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  const upcomingDeliveries: OrderToHandle[] = [];
  const pendingCollections: OrderToHandle[] = [];
  const now = new Date();
  const lateOnlyDelivery = options?.lateOnly?.delivery ?? false;
  const lateOnlyCollection = options?.lateOnly?.collection ?? false;
  let lateDeliveriesCount = 0;
  let lateCollectionsCount = 0;

  for (const order of orderList) {
    const idx = statusIndex(order.status);
    const base = {
      id: order.id,
      orderCode: order.order_code,
      customerName: customerNameById.get(order.customer_id) ?? "—",
    };

    if (
      idx > CHOT_DON_INDEX &&
      idx <= GIAO_HANG_INDEX &&
      order.rental_start_at &&
      (!branchId || order.pickup_branch_id === branchId)
    ) {
      const late = isLate(order.rental_start_at, now);
      if (late) lateDeliveriesCount += 1;
      const include = late
        ? lateOnlyDelivery
        : !lateOnlyDelivery && isWithinDateRange(order.rental_start_at, options?.delivery ?? null);
      if (include) {
        upcomingDeliveries.push({
          ...base,
          branchName: branchNameById.get(order.pickup_branch_id) ?? "—",
          actionDate: order.rental_start_at,
        });
      }
    }

    if (
      idx > VAN_HANH_INDEX &&
      idx <= THU_HOI_INDEX &&
      order.rental_end_at &&
      (!branchId || order.return_branch_id === branchId)
    ) {
      const late = isLate(order.rental_end_at, now);
      if (late) lateCollectionsCount += 1;
      const include = late
        ? lateOnlyCollection
        : !lateOnlyCollection && isWithinDateRange(order.rental_end_at, options?.collection ?? null);
      if (include) {
        pendingCollections.push({
          ...base,
          branchName: branchNameById.get(order.return_branch_id) ?? "—",
          actionDate: order.rental_end_at,
        });
      }
    }
  }

  upcomingDeliveries.sort((a, b) => a.actionDate.localeCompare(b.actionDate));
  pendingCollections.sort((a, b) => a.actionDate.localeCompare(b.actionDate));

  return {
    upcomingDeliveries: limit ? upcomingDeliveries.slice(0, limit) : upcomingDeliveries,
    pendingCollections: limit ? pendingCollections.slice(0, limit) : pendingCollections,
    lateDeliveriesCount,
    lateCollectionsCount,
  };
}
