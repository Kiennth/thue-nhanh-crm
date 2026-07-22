export interface RevenuePoint {
  label: string;
  value: number;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // lùi về thứ Hai
  date.setDate(date.getDate() + diff);
  return date;
}

export function revenueByDay(
  orders: { order_date: string; total_value: number }[],
  referenceDate: Date,
  days: number,
): RevenuePoint[] {
  const points: RevenuePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - i);
    const key = dateKey(d);
    const value = orders.filter((o) => o.order_date === key).reduce((sum, o) => sum + o.total_value, 0);
    points.push({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value });
  }
  return points;
}

export function revenueByWeek(
  orders: { order_date: string; total_value: number }[],
  referenceDate: Date,
  weeks: number,
): RevenuePoint[] {
  const currentWeekStart = startOfWeek(referenceDate);
  const points: RevenuePoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startKey = dateKey(start);
    const endKey = dateKey(end);
    const value = orders
      .filter((o) => o.order_date >= startKey && o.order_date <= endKey)
      .reduce((sum, o) => sum + o.total_value, 0);
    points.push({
      label: `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`,
      value,
    });
  }
  return points;
}

export function revenueByMonth(
  orders: { order_date: string; total_value: number }[],
  referenceDate: Date,
  months: number,
): RevenuePoint[] {
  const points: RevenuePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const value = orders
      .filter((o) => o.order_date.startsWith(key))
      .reduce((sum, o) => sum + o.total_value, 0);
    points.push({ label: `Th${d.getMonth() + 1}/${d.getFullYear()}`, value });
  }
  return points;
}
