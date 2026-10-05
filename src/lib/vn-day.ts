// Trễ hạn tính theo NGÀY (CEO 2026-10-05): đơn hẹn hôm nay mà quá giờ vẫn là
// việc của hôm nay ("quá giờ" — nhãn cam, vẫn nằm trong danh sách chính);
// chỉ sang 0h ngày hôm sau (giờ VN) mới tính là "trễ hạn/quá hạn". Dùng được
// cả server lẫn client (không phụ thuộc múi giờ máy chạy).
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" theo giờ Việt Nam.
export function vnDayKey(date: string | number | Date): string {
  return dayKeyFmt.format(new Date(date));
}

export type Lateness = "late-today" | "overdue" | null;

// null = chưa tới giờ; "late-today" = quá giờ nhưng còn trong ngày hẹn;
// "overdue" = đã sang ngày hôm sau.
export function lateness(at: string | number | Date, now: number = Date.now()): Lateness {
  const t = new Date(at).getTime();
  if (t >= now) return null;
  return vnDayKey(t) < vnDayKey(now) ? "overdue" : "late-today";
}

// Mốc 0h giờ VN của ngày "YYYY-MM-DD" — để lọc cột timestamptz (delivered_at…)
// theo ngày Việt Nam.
export function vnDayStartIso(day: string): string {
  return `${day}T00:00:00+07:00`;
}

// Ngày kế tiếp của "YYYY-MM-DD" (cho mốc kết thúc bao gồm → mốc loại trừ).
export function nextDayKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
