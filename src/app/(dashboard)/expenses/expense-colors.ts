// Không có "use client": cả server component (chấm màu trong bảng) lẫn
// client chart đều cần gọi — hàm nằm trong file client thì server gọi là
// Next chặn ngay.
//
// Hạng mục -> màu gán theo sort_order CỐ ĐỊNH (Thuê nhà luôn chart-1, Điện
// luôn chart-2...) — đổi bộ lọc hay thiếu hạng mục cũng không được nhảy màu,
// vì màu đi theo hạng mục chứ không theo vị trí trong dữ liệu hiện có.
// (chart-6 để dành riêng cho "Quỹ lương (tự tính)".)
const CATEGORY_COLOR_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-7)",
  "var(--chart-9)",
  "var(--chart-10)",
];

export function categoryColor(index: number): string {
  return CATEGORY_COLOR_SLOTS[index % CATEGORY_COLOR_SLOTS.length];
}
