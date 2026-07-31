import { VAT_RATE } from "@/lib/order-labels";
import type { CustomerType } from "@/types/database";

export interface CustomerReportRow {
  id: string;
  name: string;
  customerType: CustomerType;
  phone: string | null;
  orderCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalOwed: number;
  // Ngày đặt của đơn đầu tiên / gần nhất (chưa huỷ) — null nếu khách chưa
  // từng có đơn. Đơn đầu tiên chính là lúc khách "đến" với chi nhánh.
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}

export interface NewCustomerPoint {
  month: string;
  count: number;
}

// Đếm khách MỚI theo tháng = tháng có đơn ĐẦU TIÊN. Lưu ý khi xem theo chi
// nhánh: rows đã lọc sẵn về đơn của chi nhánh đó, nên "mới" ở đây nghĩa là
// mới với chi nhánh — một khách quen của kho khác vẫn tính là mới.
export function buildNewCustomersByMonth(
  rows: CustomerReportRow[],
  monthCount: number,
  today = new Date(),
): NewCustomerPoint[] {
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const countByMonth = new Map<string, number>();
  for (const r of rows) {
    if (!r.firstOrderDate) continue;
    const key = r.firstOrderDate.slice(0, 7);
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }

  return months.map((month) => ({ month, count: countByMonth.get(month) ?? 0 }));
}

// Khách "nguội": đã quen thuê (từ 2 đơn trở lên) nhưng lâu rồi không quay
// lại. Ngưỡng 90 ngày ~ 1 quý, đủ dài để không tính nhầm khách theo mùa vụ,
// đủ ngắn để gọi lại còn kịp.
export const DORMANT_DAYS = 90;
export const DORMANT_MIN_ORDERS = 2;

export function findDormantCustomers(
  rows: CustomerReportRow[],
  today = new Date(),
): CustomerReportRow[] {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - DORMANT_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows
    .filter(
      (r) =>
        r.orderCount >= DORMANT_MIN_ORDERS && r.lastOrderDate !== null && r.lastOrderDate < cutoffStr,
    )
    // Gọi lại người từng chi nhiều nhất trước — đây là danh sách việc cần
    // làm, không phải bảng vinh danh, nên xếp theo mức đáng để bỏ công gọi.
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export function daysSince(dateStr: string, today = new Date()): number {
  return Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}

// Doanh số/công nợ chỉ tính trên đơn CHƯA huỷ — đơn huỷ không tính là doanh
// thu/công nợ thật. Doanh số đã gồm VAT để khớp đúng số khách phải trả.
export function buildCustomerReportRows(
  // phone không bắt buộc: Trang chủ dùng bản "lite" chỉ lấy id/tên/loại.
  customers: { id: string; name: string; customer_type: CustomerType; phone?: string | null }[],
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

    const firstOrderDate = custOrders.reduce<string | null>(
      (earliest, o) => (earliest === null || o.order_date < earliest ? o.order_date : earliest),
      null,
    );
    const lastOrderDate = custOrders.reduce<string | null>(
      (latest, o) => (latest === null || o.order_date > latest ? o.order_date : latest),
      null,
    );

    return {
      id: c.id,
      name: c.name,
      customerType: c.customer_type,
      phone: c.phone ?? null,
      orderCount: custOrders.length,
      totalRevenue,
      totalPaid,
      totalOwed: Math.max(0, totalRevenue - totalPaid),
      firstOrderDate,
      lastOrderDate,
    };
  });
}
