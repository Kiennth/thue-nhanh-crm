import "server-only";

// Báo web công khai (thuenhanh.vn) làm mới trang tĩnh ngay — không cần
// deploy. Web lấy giá/cọc/bảng giá LIVE từ equipment_types nhưng giữ bản
// cache ISR tới 1 tiếng, nên mọi chỗ sửa dữ liệu web đang hiện (nội dung
// Website, giá/cọc ở Thiết bị, bảng giá bậc) đều gọi hàm này (CEO 2026-10-04:
// sửa cọc ở Thiết bị mà web chưa đổi). Best effort: lỗi thì im lặng, web tự
// hết hạn cache sau 1 tiếng. paths trống = làm mới toàn bộ.
export async function pingWebsiteRevalidate(paths?: string[]) {
  const base = process.env.WEBSITE_PUBLIC_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!base || !secret) return;
  await fetch(`${base}/api/revalidate?secret=${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paths?.length ? { paths } : {}),
  }).catch(() => {});
}
