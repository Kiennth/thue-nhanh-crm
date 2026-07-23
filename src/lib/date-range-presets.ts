export const DATE_RANGE_PRESET_OPTIONS = [
  { value: "all", label: "Tất cả thời gian" },
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last_7_days", label: "7 ngày trước" },
  { value: "last_week", label: "Tuần trước" },
  { value: "last_month", label: "Tháng trước" },
  { value: "tomorrow", label: "Ngày mai" },
  { value: "next_7_days", label: "7 ngày tới" },
  { value: "next_week", label: "Tuần tới" },
  { value: "next_month", label: "Tháng tới" },
  { value: "next_year", label: "Năm tới" },
  { value: "custom", label: "Tuỳ chỉnh..." },
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESET_OPTIONS)[number]["value"];

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Tuần = Thứ Hai -> Chủ Nhật.
function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = CN, 1 = T2, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(copy, diffToMonday);
}

export interface DateRange {
  start: string;
  end: string;
}

// Trả về null nếu preset = "all" (không lọc) hoặc "custom" mà thiếu from/to.
export function computeDateRange(
  preset: DateRangePreset,
  now: Date,
  custom?: { from?: string; to?: string },
): DateRange | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "all":
      return null;
    case "today":
      return { start: toDateStr(today), end: toDateStr(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: toDateStr(y), end: toDateStr(y) };
    }
    case "last_7_days":
      return { start: toDateStr(addDays(today, -7)), end: toDateStr(addDays(today, -1)) };
    case "last_week": {
      const thisMonday = startOfWeek(today);
      const lastMonday = addDays(thisMonday, -7);
      return { start: toDateStr(lastMonday), end: toDateStr(addDays(lastMonday, 6)) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toDateStr(start), end: toDateStr(end) };
    }
    case "tomorrow": {
      const t = addDays(today, 1);
      return { start: toDateStr(t), end: toDateStr(t) };
    }
    case "next_7_days":
      return { start: toDateStr(addDays(today, 1)), end: toDateStr(addDays(today, 7)) };
    case "next_week": {
      const thisMonday = startOfWeek(today);
      const nextMonday = addDays(thisMonday, 7);
      return { start: toDateStr(nextMonday), end: toDateStr(addDays(nextMonday, 6)) };
    }
    case "next_month": {
      const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      return { start: toDateStr(start), end: toDateStr(end) };
    }
    case "next_year": {
      const y = today.getFullYear() + 1;
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case "custom": {
      if (!custom?.from && !custom?.to) return null;
      return { start: custom?.from ?? "0001-01-01", end: custom?.to ?? "9999-12-31" };
    }
    default:
      return null;
  }
}
