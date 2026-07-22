import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import type { TaskType } from "@/types/database";

export interface OrderToHandle {
  id: string;
  orderCode: string;
  customerName: string;
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
export async function getOrdersToHandle(branchId: string): Promise<OrdersToHandleResult> {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_code, customer_id, status, rental_start_at, rental_end_at")
    .eq("branch_id", branchId)
    .is("completed_at", null)
    .is("cancelled_at", null);

  const orderList = orders ?? [];
  if (!orderList.length) return { upcomingDeliveries: [], pendingCollections: [] };

  const customerIds = [...new Set(orderList.map((o) => o.customer_id))];
  const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const upcomingDeliveries: OrderToHandle[] = [];
  const pendingCollections: OrderToHandle[] = [];

  for (const order of orderList) {
    const idx = statusIndex(order.status);

    if (idx > CHOT_DON_INDEX && idx <= GIAO_HANG_INDEX && order.rental_start_at) {
      upcomingDeliveries.push({
        id: order.id,
        orderCode: order.order_code,
        customerName: customerNameById.get(order.customer_id) ?? "—",
        actionDate: order.rental_start_at,
      });
    }

    if (idx > VAN_HANH_INDEX && idx <= THU_HOI_INDEX && order.rental_end_at) {
      pendingCollections.push({
        id: order.id,
        orderCode: order.order_code,
        customerName: customerNameById.get(order.customer_id) ?? "—",
        actionDate: order.rental_end_at,
      });
    }
  }

  upcomingDeliveries.sort((a, b) => a.actionDate.localeCompare(b.actionDate));
  pendingCollections.sort((a, b) => a.actionDate.localeCompare(b.actionDate));

  return { upcomingDeliveries, pendingCollections };
}
