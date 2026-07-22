// Chuỗi ngày/tháng/năm hiện tại theo giờ máy chủ — dùng làm giá trị mặc định
// cho các ô chọn kỳ trên dashboard (chỉ gọi từ Server Component).
export function todayParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { day: `${y}-${m}-${d}`, month: `${y}-${m}`, year: `${y}` };
}

export function revenueForDay(
  orders: { order_date: string; total_value: number }[],
  day: string,
): number {
  return orders.filter((o) => o.order_date === day).reduce((sum, o) => sum + o.total_value, 0);
}

export function revenueForMonth(
  orders: { order_date: string; total_value: number }[],
  month: string,
): number {
  return orders
    .filter((o) => o.order_date.startsWith(month))
    .reduce((sum, o) => sum + o.total_value, 0);
}

export function revenueForYear(
  orders: { order_date: string; total_value: number }[],
  year: string,
): number {
  return orders
    .filter((o) => o.order_date.startsWith(year))
    .reduce((sum, o) => sum + o.total_value, 0);
}
