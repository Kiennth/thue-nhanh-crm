-- Chuyển "Samsung Galaxy Tab S10 Ultra 14.6-inch" baf349e9… sang theo dõi
-- serial (CEO 2026-08-19). Đã áp qua REST service-role; file này là sổ sách.
--
-- Hiện trạng lúc áp: quantity với 2 unit là 2 BẢN khác nhau —
--   "Wi-Fi Only" 00050c5f (kho HN 1) + "Wi-Fi + 5G" f59ae502 (kho HN 3);
--   2 phiếu mua 01/08/2026 16tr/máy (qty 1 + qty 3); 2 dòng đơn đã đóng
--   (1 dòng qty=3 giá 4.2tr/máy).
--
-- Việc đã làm:
--   1. Tách dòng qty=3 → 3 dòng qty=1, tổng line_total giữ 12.6tr.
--   2. tracking quantity → individual (trigger bắt đổi TRƯỚC khi tạo
--      instance). Giá/cọc giữ nguyên 1tr/5tr; không đơn mở → không cần
--      đóng băng cọc.
--   3. Tạo 4 instance chi nhánh HN: AUTO-TAB-S10-ULTRA-WIFI-* (bản Wi-Fi
--      Only) + 3 AUTO-TAB-S10-ULTRA-5G-* (bản Wi-Fi + 5G); mang theo
--      purchase_price 16tr + purchase_date 2026-08-01 + ghi chú bản máy
--      từ phiếu mua (equipment_purchases không có cột instance).
--   4. Gán dòng đơn theo ĐÚNG bản: 1 dòng của unit WiFi → instance WiFi,
--      3 dòng của unit 5G → 3 instance 5G. Kiểm: 4 dòng sạch, tổng 16.8tr.
--   5. Xoá 2 phiếu mua (giá đã nằm trên instance) + 2 unit + stock đếm
--      số lượng.
--
-- CEO thay mã AUTO-* bằng serial thật trong CRM khi rảnh.

update public.equipment_types
set tracking_type = 'individual'
where id = 'baf349e9-8ea4-42c0-81da-6eb4cb59da79';
