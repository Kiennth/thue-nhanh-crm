-- Dừng kinh doanh mã hàng (CEO 2026-10-09): mã đã dừng không hiện ở các ô
-- chọn/tìm hàng khi lên đơn (Tạo đơn nhanh, ô tìm nhanh + Thêm dòng trên
-- đơn) và mặc định ẩn ở danh sách Hàng hoá. Đơn cũ, báo cáo, lịch sử giữ
-- nguyên. null = đang kinh doanh; có giá trị = thời điểm bấm dừng.
alter table public.equipment_types
  add column if not exists discontinued_at timestamptz;

notify pgrst, 'reload schema';
