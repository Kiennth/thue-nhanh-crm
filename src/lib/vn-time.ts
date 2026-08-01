import "server-only";

// CRM chỉ vận hành ở Việt Nam — mọi khái niệm "hôm nay/tháng này/tuần này"
// trên server PHẢI theo giờ Hà Nội (UTC+7), không phải giờ máy chủ. Cloudflare
// Workers luôn chạy UTC, nên `new Date().getFullYear()/getDate()...` (local
// getter) sai lệch đúng 1 ngày trong khung 00:00-06:59 giờ VN (còn là "hôm
// qua" theo UTC) — đây là nguồn gốc nhiều lệch số đã gặp (bảng lương, đơn
// hàng sắp tới, khách nguội...).
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

// Date "giả" mà các local getter (.getFullYear/.getMonth/.getDate/.getDay/
// .getHours/.setDate...) đọc đúng GIỜ VIỆT NAM, bất kể máy chạy múi giờ nào —
// tự bù trừ offset thật của runtime nên chạy đúng cả trên Cloudflare Workers
// (UTC) lẫn máy dev (đã là giờ VN). CHỈ dùng để TÍNH TOÁN LỊCH (cộng/trừ
// ngày, so ranh giới tuần/tháng/năm qua local getter) — TUYỆT ĐỐI KHÔNG gọi
// .toISOString()/lưu thẳng xuống DB từ giá trị này (epoch đã bị dịch, không
// còn là thời điểm thật).
export function vnNow(date: Date = new Date()): Date {
  return new Date(date.getTime() + VN_UTC_OFFSET_MS + date.getTimezoneOffset() * 60_000);
}

// Đọc 1 Date (thường là kết quả vnNow() đã qua cộng/trừ) thành "YYYY-MM-DD"
// bằng local getter — KHÔNG dùng toISOString() vì giờ-trong-ngày còn sót lại
// có thể lệch qua ranh giới UTC, cho sai ngày ở đúng khung 00:00-06:59.
export function formatVNDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Chuỗi "YYYY-MM-DD" của ngày hôm nay theo giờ VN — thay cho
// `new Date().toISOString().slice(0,10)` (sai vào sáng sớm) ở mọi nơi cần
// ghi ngày hôm nay (completed_date, order_date khi tạo/nhân bản đơn...).
export function vnTodayString(date: Date = new Date()): string {
  return formatVNDate(vnNow(date));
}

// Thời điểm UTC THẬT ứng với 00:00:00/23:59:59.999 giờ VN của 1 ngày
// "YYYY-MM-DD" — dùng offset +07:00 tường minh nên đúng bất kể giờ runtime,
// khác hẳn `new Date("...T00:00:00")` (không offset) vốn bị hiểu theo giờ
// runtime theo spec ECMAScript. Dùng khi cần so sánh với timestamptz thật
// (rental_start_at, .getTime()...), không phải để đọc lại bằng local getter.
export function vnStartOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`);
}

export function vnEndOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+07:00`);
}
