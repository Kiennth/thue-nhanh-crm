// Logic tính thống kê/xu hướng theo tuần/tháng/năm dùng CHUNG cho nhiều
// nguồn dữ liệu khác nhau (đơn hàng ở orders-overview.ts, doanh thu theo
// sản phẩm ở equipment-revenue-overview.ts...) — tách ra khỏi
// orders-overview.ts (trước đây riêng cho đơn hàng) để không copy-paste lại
// ~250 dòng logic ngày tháng mỗi khi cần "tổng theo khoảng thời gian" trên
// một tập dữ liệu khác.
//
// KHÔNG dùng cho equipment-value-overview.ts — logic ở đó là "số dư tính
// tại 1 mốc" (balance-as-of-date), khác bản chất "tổng trong khoảng" ở đây.

const WEEK_TREND_COUNT = 8;
const MONTH_TREND_COUNT = 6;
const YEAR_TREND_COUNT = 5;

export interface DatedValue {
  // "YYYY-MM-DD" — so sánh chuỗi trực tiếp, giống order_date.
  date: string;
  value: number;
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
  // Giá trị của đúng kỳ này 1 năm trước (cùng khoảng ngày, dịch lùi đúng 1
  // năm) — chỉ có ở view tuần/tháng, view năm tự thân đã là so sánh liên năm.
  previousYearCount?: number;
  previousYearRevenue?: number;
}

export interface PeriodOverview {
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  trend: {
    week: TrendPoint[];
    month: TrendPoint[];
    year: TrendPoint[];
  };
}

export function toDateOnly(d: Date) {
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

function shiftYears(d: Date, years: number) {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}

function sumInRange(items: DatedValue[], start: Date, end: Date) {
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);
  let count = 0;
  let totalRevenue = 0;
  for (const item of items) {
    if (item.date >= startStr && item.date <= endStr) {
      count += 1;
      totalRevenue += item.value;
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

export function computeWeekStat(items: DatedValue[], today: Date): PeriodStat {
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(weekStart, -1);

  const current = sumInRange(items, weekStart, weekEnd);
  const prev = sumInRange(items, prevWeekStart, prevWeekEnd);
  const elapsedDays = Math.floor((today.getTime() - weekStart.getTime()) / 86400000) + 1;

  return buildPeriodStat("Tuần này", current, prev, elapsedDays / 7);
}

export function computeMonthStat(items: DatedValue[], today: Date): PeriodStat {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const current = sumInRange(items, monthStart, monthEnd);
  const prev = sumInRange(items, prevMonthStart, prevMonthEnd);
  const totalDays = daysInMonth(today.getFullYear(), today.getMonth());

  return buildPeriodStat("Tháng này", current, prev, today.getDate() / totalDays);
}

export function computeYearStat(items: DatedValue[], today: Date): PeriodStat {
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const prevYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const prevYearEnd = new Date(today.getFullYear() - 1, 11, 31);

  const current = sumInRange(items, yearStart, yearEnd);
  const prev = sumInRange(items, prevYearStart, prevYearEnd);
  const totalDays = isLeapYear(today.getFullYear()) ? 366 : 365;
  const dayOfYear = Math.floor((today.getTime() - yearStart.getTime()) / 86400000) + 1;

  return buildPeriodStat("Năm nay", current, prev, dayOfYear / totalDays);
}

// 364 ngày = đúng 52 tuần — dịch lùi giữ nguyên thứ trong tuần (khác với dịch
// lùi 1 năm dương lịch, vốn không rơi đúng vào cùng thứ).
const ONE_YEAR_IN_WEEKS_DAYS = 364;

export function buildWeekTrend(items: DatedValue[], today: Date): TrendPoint[] {
  const currentWeekStart = startOfWeekMonday(today);
  const points: TrendPoint[] = [];
  for (let i = WEEK_TREND_COUNT - 1; i >= 0; i--) {
    const start = addDays(currentWeekStart, -7 * i);
    const end = addDays(start, 6);
    const isCurrent = i === 0;
    const compareEnd = isCurrent ? today : end;
    const { count, totalRevenue } = sumInRange(items, start, compareEnd);
    const lastYear = sumInRange(
      items,
      addDays(start, -ONE_YEAR_IN_WEEKS_DAYS),
      addDays(compareEnd, -ONE_YEAR_IN_WEEKS_DAYS),
    );
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
        previousYearCount: lastYear.count,
        previousYearRevenue: lastYear.totalRevenue,
      });
    } else {
      points.push({
        label,
        count,
        revenue: totalRevenue,
        isCurrent: false,
        previousYearCount: lastYear.count,
        previousYearRevenue: lastYear.totalRevenue,
      });
    }
  }
  return points;
}

export function buildMonthTrend(items: DatedValue[], today: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = MONTH_TREND_COUNT - 1; i >= 0; i--) {
    const bucketDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(bucketDate.getFullYear(), bucketDate.getMonth() + 1, 0);
    const isCurrent = i === 0;
    const compareEnd = isCurrent ? today : end;
    const { count, totalRevenue } = sumInRange(items, bucketDate, compareEnd);
    const lastYear = sumInRange(items, shiftYears(bucketDate, -1), shiftYears(compareEnd, -1));
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
        previousYearCount: lastYear.count,
        previousYearRevenue: lastYear.totalRevenue,
      });
    } else {
      points.push({
        label,
        count,
        revenue: totalRevenue,
        isCurrent: false,
        previousYearCount: lastYear.count,
        previousYearRevenue: lastYear.totalRevenue,
      });
    }
  }
  return points;
}

export function buildYearTrend(items: DatedValue[], today: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let i = YEAR_TREND_COUNT - 1; i >= 0; i--) {
    const year = today.getFullYear() - i;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const isCurrent = i === 0;
    const { count, totalRevenue } = sumInRange(items, start, isCurrent ? today : end);
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

export function buildPeriodOverview(items: DatedValue[], today: Date): PeriodOverview {
  return {
    week: computeWeekStat(items, today),
    month: computeMonthStat(items, today),
    year: computeYearStat(items, today),
    trend: {
      week: buildWeekTrend(items, today),
      month: buildMonthTrend(items, today),
      year: buildYearTrend(items, today),
    },
  };
}
