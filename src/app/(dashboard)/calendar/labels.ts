import type { BarStatus } from "@/lib/calendar-data";

// Dùng chung cho server (chú thích màu) và client (tooltip thanh) — để riêng
// vì hằng số export từ file "use client" không đọc được ở Server Component.
export const STATUS_LABEL: Record<BarStatus, string> = {
  reserved: "Đã đặt, chưa giao",
  out: "Đang ở chỗ khách",
  late: "Quá giờ trả (trong ngày)",
  overdue: "Quá hạn chưa thu hồi (sang ngày sau)",
  done: "Đã xong",
};
