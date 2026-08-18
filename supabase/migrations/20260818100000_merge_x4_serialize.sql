-- Gom 2 SKU Insta360 ONE X4 + chuyển theo serial (CEO 2026-08-18).
-- Đã áp qua REST service-role; file này là sổ sách.
--
-- Hiện trạng lúc áp:
--   "Insta360 ONE X4" 28eda15c (individual, 400k/cọc 2tr): VỎ RỖNG — 0 unit,
--     0 instance, 0 dòng đơn → XOÁ (cascade web row thue-insta360-one-x4 cũ;
--     đã dọn id chết khỏi related_product_ids các sản phẩm khác).
--   "Máy quay Insta360 ONE X4" f4b7abfc (quantity, 600k/cọc 5tr): hàng thật
--     — 30 instances có sẵn (24 available + 6 rented), 60 dòng đơn (đều
--     qty=1, unit_id null kiểu legacy), 1 đơn mở BQ11899 6 dòng.
--
-- Việc đã làm trên f4b7abfc:
--   1. tracking_type quantity → individual (giá/cọc giữ nguyên 600k/5tr —
--      không đổi nên KHÔNG cần đóng băng cọc đơn mở).
--   2. 6 dòng đơn mở BQ11899 ← gán đúng 6 instance đang status='rented'.
--   3. 54 dòng lịch sử đã đóng ← round-robin 30 instances.
--   4. Xoá equipment_unit + equipment_stock kiểu đếm số lượng (không có
--      equipment_purchases nào phải mang theo).
--   5. Web: giữ row của f4b7abfc, đổi slug thue-may-quay-insta360-one-x4 →
--      thue-insta360-one-x4 (slug đẹp của vỏ rỗng vừa xoá), tên hiển thị
--      web "Insta360 ONE X4"; nằm trong danh mục Camera 360o.

update public.equipment_types
set tracking_type = 'individual'
where id = 'f4b7abfc-802e-4b9d-b459-303850323c1b';

-- (Chi tiết gán instance từng dòng thực hiện qua REST — 60 dòng, xem log
-- phiên 2026-08-18. Không lặp lại được bằng SQL thuần vì phụ thuộc thứ tự
-- round-robin lúc chạy.)

-- Vỏ rỗng 28eda15c… đã xoá qua REST trước khi ghi file này (id đầy đủ không
-- còn tra được sau khi xoá) — lệnh tương đương:
-- delete from public.equipment_types where name = 'Insta360 ONE X4' and tracking_type = 'individual';
