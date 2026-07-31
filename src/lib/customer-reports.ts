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

// Ngày đơn đầu tiên của từng khách trên TOÀN CÔNG TY (mọi chi nhánh) — phải
// dựng từ danh sách đơn CHƯA lọc chi nhánh. Dùng làm mốc "khách này đến với
// công ty từ bao giờ", tách bạch với ngày đầu tiên trong phạm vi đang xem.
export function buildCompanyFirstOrderMap(
  orders: { customer_id: string; order_date: string; cancelled_at: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of orders) {
    if (o.cancelled_at) continue;
    const cur = map.get(o.customer_id);
    if (cur === undefined || o.order_date < cur) map.set(o.customer_id, o.order_date);
  }
  return map;
}

// Đếm khách MỚI theo tháng, hiểu là mới với CẢ CÔNG TY: khách chưa từng thuê
// ở bất kỳ chi nhánh nào trước đó. Khi xem theo chi nhánh thì chỉ tính những
// khách ra mắt công ty ngay tại chi nhánh này (đơn đầu tiên toàn công ty
// trùng với đơn đầu tiên trong phạm vi) — khách quen của kho khác lần đầu
// thuê ở đây KHÔNG tính là mới.
export function buildNewCustomersByMonth(
  rows: CustomerReportRow[],
  monthCount: number,
  companyFirstOrder: Map<string, string>,
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
    const companyFirst = companyFirstOrder.get(r.id) ?? r.firstOrderDate;
    // Khách đã thuê ở chi nhánh khác từ trước → không phải khách mới của
    // công ty, dù đây là lần đầu họ thuê ở phạm vi đang xem.
    if (companyFirst !== r.firstOrderDate) continue;
    const key = companyFirst.slice(0, 7);
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

export interface ReturningRatePoint {
  month: string;
  // Số khách có đơn trong tháng, và trong đó bao nhiêu người đã từng thuê
  // trước tháng này. rate = null khi tháng đó không có khách nào (tránh chia
  // cho 0 và tránh vẽ điểm 0% giả).
  activeCount: number;
  returningCount: number;
  rate: number | null;
}

// Tỉ lệ quay lại của MỘT tháng = trong số khách có đơn tháng đó, bao nhiêu %
// đã từng thuê từ trước. Đọc thẳng được: "100 khách thuê tháng này thì X
// người là khách cũ". Khác với ô "Khách quay lại (2+ đơn)" — ô đó cộng dồn
// từ đầu đến giờ nên gần như không bao giờ nhúc nhích.
export function buildReturningRateByMonth(
  orders: { customer_id: string; order_date: string; cancelled_at: string | null }[],
  monthCount: number,
  // Mốc "cũ/mới" lấy trên toàn công ty cho khớp với cách đếm khách mới —
  // khách quen của kho khác ghé đây lần đầu vẫn là khách cũ của công ty.
  companyFirstOrder: Map<string, string>,
  today = new Date(),
): ReturningRatePoint[] {
  const active = orders.filter((o) => !o.cancelled_at);

  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const customersByMonth = new Map<string, Set<string>>();
  for (const o of active) {
    const key = o.order_date.slice(0, 7);
    const set = customersByMonth.get(key) ?? new Set<string>();
    set.add(o.customer_id);
    customersByMonth.set(key, set);
  }

  return months.map((month) => {
    const custs = customersByMonth.get(month) ?? new Set<string>();
    let returningCount = 0;
    for (const id of custs) {
      const first = companyFirstOrder.get(id);
      // "Khách cũ" = đơn đầu tiên nằm TRƯỚC tháng này. So chuỗi "YYYY-MM-DD"
      // với "YYYY-MM" đầu tháng là đủ vì cùng định dạng ISO.
      if (first !== undefined && first < `${month}-01`) returningCount++;
    }
    return {
      month,
      activeCount: custs.size,
      returningCount,
      rate: custs.size > 0 ? (returningCount / custs.size) * 100 : null,
    };
  });
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
