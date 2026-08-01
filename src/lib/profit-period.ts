// Kỳ xem của khối Lợi nhuận gộp — tách khỏi component ("use client") vì
// server component (trang chủ) cần gọi guard này khi đọc searchParams;
// hàm export từ module client không gọi được phía server.
export const PROFIT_PERIOD_OPTIONS = [
  { value: "month", label: "Tháng này" },
  { value: "prevMonth", label: "Tháng trước" },
  { value: "year", label: "Năm nay" },
  { value: "prevYear", label: "Năm trước" },
] as const;

export type ProfitPeriod = (typeof PROFIT_PERIOD_OPTIONS)[number]["value"];

export function isProfitPeriod(value: string): value is ProfitPeriod {
  return (PROFIT_PERIOD_OPTIONS.map((o) => o.value) as string[]).includes(value);
}
