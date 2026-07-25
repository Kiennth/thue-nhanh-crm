import "server-only";
import { createClient } from "@/lib/supabase/server";

const CHUNK = 1000;
const WEEK_TREND_COUNT = 8;
const MONTH_TREND_COUNT = 6;
const YEAR_TREND_COUNT = 5;

interface LiteOrder {
  order_date: string;
  total_value: number;
}

export interface PeriodStat {
  label: string;
  count: number;
  totalRevenue: number;
  avgValue: number;
  growthPct: number | null;
  projectedCount: number;
  projectedRevenue: number;
}

export interface TrendPoint {
  label: string;
  count: number;
  revenue: number;
  isCurrent: boolean;
  projectedCount?: number;
  projectedRevenue?: number;
}

export interface OrdersOverview {
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  trend: {
    week: TrendPoint[];
    month: TrendPoint[];
    year: TrendPoint[];
  };
}

function toDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Supabase/PostgREST giới hạn 1.000 dòng mỗi lần gọi — cần TOÀN BỘ đơn (chưa
// huỷ) để tính thống kê/xu hướng theo thời gian, không chỉ trang hiện tại.
async function fetchNonCancelledOrders(branchId: string | null): Promise<LiteOrder[]> {
  const supabase = await createClient();
  const all: LiteOrder[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("orders")
      .select("order_date, total_value")
      .is("cancelled_at", null)
      .order("id")
      .range(from, from + CHUNK - 1);
    if (branchId) {
      q = q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
    }
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

function sumInRange(orders: LiteOrder[], start: Date, end: Date) {
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);
  let count = 0;
  let totalRevenue = 0;
  for (const o of orders) {
    if (o.order_date >= startStr && o.order_date <= endStr) {
      count += 1;
      totalRevenue += o.total_value;
    }
  }
  return { count, totalRevenue };
}

function buildPeriodStat(
  label: string,
  current: { count: number; totalRevenue: number },
  prev: { count: number; totalRevenue: number },
  elapsedFraction: number,
): PeriodStat {
  const avgValue = current.count > 0 ? current.totalRevenue / current.count : 0;
  const growthPct = prev.count > 0 ? ((current.count - prev.count) / prev.count) * 100 : null;
  const safeFraction = elapsedFraction > 0 ? elapsedFraction : 1;
  return {
    label,
    count: current.count,
    totalRevenue: current.totalRevenue,
    avgValue,
    growthPct,
    projectedCount: Math.round(current.count / safeFraction),
    projectedRevenue: Math.round(current.totalRevenue / safeFraction),
  };
}

function computeWeekStat(orders: LiteOrder[], today: Date): PeriodStat {
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(weekStart, -1);

  const current = sumInRange(orders, weekStart, weekEnd);
  const prev = sumInRange(orders, prevWeekStart, prevWeekEnd);
  const elapsedDays = Math.floor((today.getTime() - weekStart.getTime()) / 86400000) + 1;

  return buildPeriodStat("Tuần này", current, prev, elapsedDays / 7);
}

function computeMonthStat(orders: LiteOrder[], today: Date): PeriodStat {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const current = sumInRange(orders, monthStart, monthEnd);
  const prev = sumInRange(orders, prevMonthStart, prevMonthEnd);
  const totalDays = daysInMonth(today.getFullYear(), today.getMonth());

  return buildPeriodStat("Tháng này", current, prev, today.getDate() / totalDays);
}

function computeYearStat(orders: LiteOrder[], today: Date): PeriodStat {
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const prevYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const prevYearEnd = new Date(today.getFullYear() - 1, 11, 31);

  const current = sumInRange(orders, yearStart, yearEnd);
  const prev = sumInRange(orders, prevYearStart, prevYearEnd);
  const totalDays = isLeapYear(today.getFullYear()) ? 366 : 365;
  const dayOfYear = Math.floor((today.getTime() - yearStart.getTime()) / 86400000) + 1;

  return buildPeriodStat("Năm nay", current, prev, dayOfYear / totalDays);
}

function buildWeekTrend(orders: LiteOrder[], today: Date): TrendPoint[] {
  const currentWeekStart = startOfWeekMonday(today);
  const points: TrendPoint[] = [];
  for (let i = WEEK_TREND_COUNT - 1; i >= 0; i--) {
    const start = addDays(currentWeekStart, -7 * i);
    const end = addDays(start, 6);
    const isCurrent = i === 0;
    const { count, totalRevenue } = sumInRange(orders, start, isCurrent ? today : end);
    const label = `${start.getDate()}/${start.getMonth() + 1}`;
    if (isCurrent) {
      const elapsedDays = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
      const fraction = elapsedDays / 7 || 1;
      points.push({
        label,
        count,
        revenue: totalRevenue,
        isCurrent: true,
        projectedCount: Math.round(count / fraction),
        projectedRevenue: Math.round(totalRevenue / fraction),
      });
    } else {
      points.push({ label, count, revenue: totalRevenue, isCurrent: false });
    }
  }
  return points;
}

function buildMonthTrend(orders: LiteOrder[], today: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = MONTH_TREND_COUNT - 1; i >= 0; i--) {
    const bucketDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(bucketDate.getFullYear(), bucketDate.getMonth() + 1, 0);
    const isCurrent = i === 0;
    const { count, totalRevenue } = sumInRange(orders, bucketDate, isCurrent ? today : end);
    const label = `Th${bucketDate.getMonth() + 1}`;
    if (isCurrent) {
      const totalDays = daysInMonth(bucketDate.getFullYear(), bucketDate.getMonth());
      const fraction = today.getDate() / totalDays || 1;
      points.push({
        label,
        count,
        revenue: totalRevenue,
        isCurrent: true,
        projectedCount: Math.round(count / fraction),
        projectedRevenue: Math.round(totalRevenue / fraction),
      });
    } else {
      points.push({ label, count, revenue: totalRevenue, isCurrent: false });
    }
  }
  return points;
}

function buildYearTrend(orders: LiteOrder[], today: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = YEAR_TREND_COUNT - 1; i >= 0; i--) {
    const year = today.getFullYear() - i;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const isCurrent = i === 0;
    const { count, totalRevenue } = sumInRange(orders, start, isCurrent ? today : end);
    const label = String(year);
    if (isCurrent) {
      const totalDays = isLeapYear(year) ? 366 : 365;
      const dayOfYear = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
      const fraction = dayOfYear / totalDays || 1;
      points.push({
        label,
        count,
        revenue: totalRevenue,
        isCurrent: true,
        projectedCount: Math.round(count / fraction),
        projectedRevenue: Math.round(totalRevenue / fraction),
      });
    } else {
      points.push({ label, count, revenue: totalRevenue, isCurrent: false });
    }
  }
  return points;
}

// Thống kê + xu hướng đơn hàng theo tuần/tháng/năm cho trang /orders — không
// tính đơn đã huỷ, không phụ thuộc bộ lọc trạng thái/thời gian của bảng danh
// sách (luôn là bức tranh toàn cảnh, chỉ giới hạn theo chi nhánh).
export async function computeOrdersOverview(
  branchId: string | null,
  now = new Date(),
): Promise<OrdersOverview> {
  const orders = await fetchNonCancelledOrders(branchId);
  const today = toDateOnly(now);
  return {
    week: computeWeekStat(orders, today),
    month: computeMonthStat(orders, today),
    year: computeYearStat(orders, today),
    trend: {
      week: buildWeekTrend(orders, today),
      month: buildMonthTrend(orders, today),
      year: buildYearTrend(orders, today),
    },
  };
}
