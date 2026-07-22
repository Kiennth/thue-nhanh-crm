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
