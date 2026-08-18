-- Chuyển 2 loại sang theo dõi theo serial (CEO 2026-08-18). Đã áp qua
-- REST service-role; file này là sổ sách.
--
-- 1. "Insta360 ONE X6" a566e0af (tạo 2026-08-18 từ web cũ, CEO đã đổi tên
--    gọn trong CRM): sạch tinh — 0 unit/instance/dòng đơn → chỉ đổi
--    tracking. CEO tự thêm serial trong CRM khi nhập máy.
-- 2. "Insta360 Mic Air": 1 unit + 1 instance + 1 dòng đơn lịch sử (đã đóng)
--    → dòng gán vào instance duy nhất, xoá unit/stock đếm số lượng.

update public.equipment_types
set tracking_type = 'individual'
where name in ('Insta360 ONE X6', 'Insta360 Mic Air');
