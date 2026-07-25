import { VAT_RATE } from "@/lib/order-labels";
import type { CustomerType } from "@/types/database";

export interface CustomerReportRow {
  id: string;
  name: string;
  customerType: CustomerType;
  orderCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalOwed: number;
}

// Doanh số/công nợ chỉ tính trên đơn CHƯA huỷ — đơn huỷ không tính là doanh
// thu/công nợ thật. Doanh số đã gồm VAT để khớp đúng số khách phải trả.
export function buildCustomerReportRows(
  customers: { id: string; name: string; customer_type: CustomerType }[],
  orders: {
    id: string;
    customer_id: string;
    total_value: number;
    order_date: string;
    cancelled_at: string | null;
  }[],
  payments: { order_id: string; amount: number }[],
): CustomerReportRow[] {
  const paidByOrderId = new Map<string, number>();
  for (const p of payments) {
    paidByOrderId.set(p.order_id, (paidByOrderId.get(p.order_id) ?? 0) + p.amount);
  }

  const activeOrders = orders.filter((o) => !o.cancelled_at);
  const ordersByCustomer = new Map<string, typeof activeOrders>();
  for (const o of activeOrders) {
    const list = ordersByCustomer.get(o.customer_id) ?? [];
    list.push(o);
    ordersByCustomer.set(o.customer_id, list);
  }

  return customers.map((c) => {
    const custOrders = ordersByCustomer.get(c.id) ?? [];
    const totalRevenue = custOrders.reduce(
      (sum, o) => sum + Math.round(o.total_value * (1 + VAT_RATE) * 100) / 100,
      0,
    );
    const totalPaid = custOrders.reduce((sum, o) => sum + (paidByOrderId.get(o.id) ?? 0), 0);

    return {
      id: c.id,
      name: c.name,
      customerType: c.customer_type,
      orderCount: custOrders.length,
      totalRevenue,
      totalPaid,
      totalOwed: Math.max(0, totalRevenue - totalPaid),
    };
  });
}
