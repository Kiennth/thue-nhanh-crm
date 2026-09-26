// Kiểu lưới cho bảng "Danh sách thiết bị" (CEO 2026-09-26: các cột Hàng hoá /
// Biến thể / Số kỳ tính / Giá thuê khó nhìn, cần phân ô tách bạch) — kẻ dọc
// giữa các cột, dải tiêu đề nền xám, dòng xen kẽ đậm nhạt, nội dung canh đầu
// ô để ô nhập + dòng diễn giải bên dưới thẳng hàng giữa các cột. Dùng chung
// cho bảng kéo thả (quản lý) và bảng chỉ xem.
export const ORDER_LINES_TABLE_CLASS = [
  "min-w-[1080px] table-fixed",
  "[&_th]:border-r [&_th:last-child]:border-r-0 [&_td]:border-r [&_td:last-child]:border-r-0",
  "[&_thead_tr]:bg-muted/70 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase",
  "[&_td]:py-2.5 [&_td]:align-top",
  "[&_tbody_tr:nth-child(even)]:bg-muted/30",
].join(" ");
