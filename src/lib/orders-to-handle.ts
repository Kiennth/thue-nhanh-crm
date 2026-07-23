import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
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
}

const CHOT_DON_INDEX = TASK_TYPE_SEQUENCE.indexOf("chot_don");
const GIAO_HANG_INDEX = TASK_TYPE_SEQUENCE.indexOf("giao_hang_ban_giao");
const VAN_HANH_INDEX = TASK_TYPE_SEQUENCE.indexOf("van_hanh_xu_ly_su_co");
const THU_HOI_INDEX = TASK_TYPE_SEQUENCE.indexOf("thu_hoi");

function statusIndex(status: TaskType) {
  return TASK_TYPE_SEQUENCE.indexOf(status);
}

// "Đơn hàng sắp tới" (cần giao) — hiện ngay khi đã Chốt đơn xong, cho đến khi
// Giao hàng & bàn giao xong thì thôi. "Đơn hàng cần thu hồi" — hiện khi đã
// Vận hành/xử lý sự cố xong, cho đến khi Thu hồi xong. Dùng orders.status
// (= khâu sớm nhất chưa hoàn thành, tự đồng bộ qua trigger) để suy ra khâu
// nào đã/chưa xong mà không cần join order_tasks.
//
// branchId = null nghĩa là không lọc theo chi nhánh (dùng cho Admin/Kế toán —
// xem tất cả kho); branchId cụ thể chỉ trả về đơn của đúng chi nhánh đó (nhân
// viên kỹ thuật/quản lý chi nhánh — chỉ thấy kho mình).
export async function getOrdersToHandle(branchId: string | null): Promise<OrdersToHandleResult> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_code, customer_id, branch_id, status, rental_start_at, rental_end_at")
    .is("completed_at", null)
    .is("cancelled_at", null);
  if (branchId) {
    query = query.eq("branch_id", branchId);
  }
  const { data: orders } = await query;

  const orderList = orders ?? [];
  if (!orderList.length) return { upcomingDeliveries: [], pendingCollections: [] };

  const customerIds = [...new Set(orderList.map((o) => o.customer_id))];
  const branchIds = [...new Set(orderList.map((o) => o.branch_id))];
  const [{ data: customers }, { data: branches }] = await Promise.all([
    supabase.from("customers").select("id, name").in("id", customerIds),
    supabase.from("branches").select("id, name").in("id", branchIds),
  ]);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  const upcomingDeliveries: OrderToHandle[] = [];
  const pendingCollections: OrderToHandle[] = [];

  for (const order of orderList) {
    const idx = statusIndex(order.status);
    const base = {
      id: order.id,
      orderCode: order.order_code,
      customerName: customerNameById.get(order.customer_id) ?? "—",
      branchName: branchNameById.get(order.branch_id) ?? "—",
    };

    if (idx > CHOT_DON_INDEX && idx <= GIAO_HANG_INDEX && order.rental_start_at) {
      upcomingDeliveries.push({ ...base, actionDate: order.rental_start_at });
    }

    if (idx > VAN_HANH_INDEX && idx <= THU_HOI_INDEX && order.rental_end_at) {
      pendingCollections.push({ ...base, actionDate: order.rental_end_at });
    }
  }

  upcomingDeliveries.sort((a, b) => a.actionDate.localeCompare(b.actionDate));
  pendingCollections.sort((a, b) => a.actionDate.localeCompare(b.actionDate));

  return { upcomingDeliveries, pendingCollections };
}
