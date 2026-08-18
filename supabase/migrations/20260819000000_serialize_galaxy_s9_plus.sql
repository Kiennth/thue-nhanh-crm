-- Chuyển "Điện thoại Samsung Galaxy S9 Plus" sang theo dõi theo serial
-- (CEO 2026-08-19). Đã áp qua REST service-role; file này là sổ sách.
-- Loại đang sạch tinh — 0 unit, 0 instance, 0 dòng đơn → chỉ đổi tracking.
-- CEO tự thêm serial trong CRM khi nhập máy.

update public.equipment_types
set tracking_type = 'individual'
where name = 'Điện thoại Samsung Galaxy S9 Plus';
