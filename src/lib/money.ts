// Định dạng tiền VND dùng chung (Grok tách gọn CRM 10/10): luôn làm tròn đến
// đồng — giá nhập kiểu "đã gồm VAT" (3.200.000 / 1,08) làm tổng có số lẻ, trước
// đây hiện thành "…,22đ". Chỉ sửa HIỂN THỊ, dữ liệu numeric(14,2) giữ nguyên
// (CEO 10/10).
const VND = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export function formatVND(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `${VND.format(Number.isFinite(v) ? Math.round(v) : 0)}đ`;
}
