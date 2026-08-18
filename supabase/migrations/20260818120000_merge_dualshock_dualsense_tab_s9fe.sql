-- Gom 3 cặp SKU trùng (CEO 2026-08-18). Đã áp qua REST service-role;
-- file này là sổ sách.
--
-- 1. "Sony DualShock Controller" 7c7d7743: VỎ RỖNG (0 unit/dòng đơn, chỉ có
--    web row trống) → XOÁ. Giữ "Tay cầm PS4 Sony DUALSHOCK" 4f9dbdf1
--    (quantity, 56 dòng, kho 31 máy 3 chi nhánh) nguyên trạng.
-- 2. "Sony Dualsense Controller" b80876fe: VỎ RỖNG → XOÁ. Giữ "Tay cầm Sony
--    DualSense" f2b86d59 (quantity, 130 dòng, kho 30, đơn mở BQ12210 không
--    bị đụng — giá/cọc không đổi).
-- 3. Tab S9 FE — ngược đời: hàng thật là "Máy tính bảng Samsung Galaxy Tab
--    S9 FE" 4bccf40a (quantity, 91 dòng, 30 instance AUTO có sẵn, kho 30,
--    KHÔNG đơn mở), còn vỏ rỗng "Samsung Galaxy Tab S9 FE" 89551422 lại giữ
--    trang web đẹp (mô tả song ngữ + 4 ảnh + slug thue-samsung-galaxy-tab-s9-fe).
--    Đã làm trên 4bccf40a:
--      a. Tách 3 dòng qty>1 (3+3+2) thành từng dòng qty=1, giữ unit_price,
--         tổng line_total không đổi.
--      b. Đổi tên → "Samsung Galaxy Tab S9 FE", tracking quantity→individual,
--         cọc 3tr→2tr theo bản CEO tạo (không đơn mở → không cần đóng băng).
--      c. 96 dòng (đều đã đóng) gán round-robin 30 instance.
--      d. Web: xoá row rỗng thue-may-tinh-bang-samsung-galaxy-tab-s9-fe,
--         trỏ row đẹp của vỏ sang type thật rồi mới xoá vỏ.
--      e. Xoá equipment_unit + equipment_stock kiểu đếm số lượng (không có
--         equipment_purchases phải mang theo).
--    Instance vẫn mang mã AUTO-…; CEO thay serial thật trong CRM khi rảnh.

update public.equipment_types
set name = 'Samsung Galaxy Tab S9 FE',
    tracking_type = 'individual',
    deposit_amount = 2000000
where id = '4bccf40a-c20a-4eda-a35b-a02a7fc15816';

-- Vỏ rỗng đã xoá qua REST — lệnh tương đương:
-- delete from public.equipment_types where id in (
--   '89551422-2167-4dd2-8952-43b55dbed267',  -- Samsung Galaxy Tab S9 FE (vỏ)
--   '7c7d7743-a7d5-441b-a22b-ac6e253bdc43',  -- Sony DualShock Controller (vỏ)
--   'b80876fe-39de-42a3-8b82-f29159a33b23'   -- Sony Dualsense Controller (vỏ)
-- );

-- (Chi tiết tách dòng + gán instance thực hiện qua REST — xem log phiên
-- 2026-08-18; không lặp lại được bằng SQL thuần vì phụ thuộc round-robin.)
