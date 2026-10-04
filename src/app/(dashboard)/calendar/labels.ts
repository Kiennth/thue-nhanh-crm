import type { BarStatus } from "@/lib/calendar-data";

// Dùng chung cho server (chú thích màu) và client (tooltip thanh) — để riêng
// vì hằng số export từ file "use client" không đọc được ở Server Component.
export const STATUS_LABEL: Record<BarStatus, string> = {
  reserved: "Đã đặt, chưa giao",
  out: "Đang ở chỗ khách",
  overdue: "Quá hạn chưa thu hồi",
  done: "Đã xong",
};
