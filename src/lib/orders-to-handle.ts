import "server-only";
import { createClient } from "@/lib/supabase/server";

export type OrderActionBucket = "overdue" | "today" | "tomorrow" | "upcoming";

export interface OrderToHandle {
  id: string;
  orderCode: string;
  customerName: string;
  actionLabel: "Giao hàng" | "Thu hồi";
  actionDate: string;
  bucket: OrderActionBucket;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bucketFor(actionDate: string, todayStr: string, tomorrowStr: string): OrderActionBucket {
  const dateOnly = actionDate.slice(0, 10);
  if (dateOnly < todayStr) return "overdue";
  if (dateOnly === todayStr) return "today";
  if (dateOnly === tomorrowStr) return "tomorrow";
  return "upcoming";
}

// Đơn cần xử lý ("Giao hàng" khi đơn đang ở đúng khâu "Giao hàng & bàn giao",
// "Thu hồi" khi đang ở khâu "Thu hồi") — dùng orders.status (đã tự động đồng
// bộ theo khâu tính khoán gần nhất chưa hoàn thành qua trigger) làm nguồn xác
// định thay vì tự dò order_tasks, để luôn khớp đúng thứ tự khâu bắt buộc.
export async function getOrdersToHandle(branchId: string, todayStr: string): Promise<OrderToHandle[]> {
  const tomorrowStr = addDays(todayStr, 1);
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_code, customer_id, status, rental_start_at, rental_end_at")
    .eq("branch_id", branchId)
    .is("completed_at", null)
    .is("cancelled_at", null)
    .in("status", ["giao_hang_ban_giao", "thu_hoi"]);

  const orderList = orders ?? [];
  if (!orderList.length) return [];

  const customerIds = [...new Set(orderList.map((o) => o.customer_id))];
  const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const results: OrderToHandle[] = [];
  for (const order of orderList) {
    const actionDate = order.status === "giao_hang_ban_giao" ? order.rental_start_at : order.rental_end_at;
    if (!actionDate) continue;
    results.push({
      id: order.id,
      orderCode: order.order_code,
      customerName: customerNameById.get(order.customer_id) ?? "—",
      actionLabel: order.status === "giao_hang_ban_giao" ? "Giao hàng" : "Thu hồi",
      actionDate,
      bucket: bucketFor(actionDate, todayStr, tomorrowStr),
    });
  }

  return results.sort((a, b) => a.actionDate.localeCompare(b.actionDate));
}
