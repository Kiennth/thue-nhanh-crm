-- Gom "iPhone 16 Pro (SL)" (đếm số lượng) vào "iPhone 16 Pro" (theo serial)
-- — CEO 2026-08-17. Đã áp qua REST service-role; file này là sổ sách.
--
-- Hiện trạng lúc áp:
--   nguồn 5f55dd65 "iPhone 16 Pro (SL)": 1 unit (f442b925, không purchase),
--     stock 1 @ branch 0f39724e, 4 dòng đơn (BQ5446/BQ5676/BQ5761/BQ6569,
--     đều quantity=1, đều nhap_kho_bao_tri — KHÔNG cần đóng băng cọc dù
--     deposit 0đ → 10tr, vì không còn đơn mở), website thue-iphone-16-pro-sl.
--   đích 68eaf22d "iPhone 16 Pro": 1 instance e9e3ce43
--     (AUTO-IPHONE-16-PRO-08b0b348 @ branch a877af86), website
--     thue-iphone-16-pro (4 ảnh) — giữ website đích, bỏ website nguồn.
-- Lưu ý: stock nguồn nằm branch 0f39724e nhưng instance đích ở a877af86 —
-- coi là CÙNG một máy vật lý, branch của instance (CEO tạo tay) là chuẩn.

update public.order_equipment
set equipment_type_id = '68eaf22d-7cbc-40c1-b99c-69cd40507948',
    equipment_instance_id = 'e9e3ce43-bc40-4500-a3f1-302f76bb59fa',
    equipment_unit_id = null
where id in (
  '4c2402fc-b612-4e63-b05c-38db668b327f',
  '067b5a93-f9eb-4c69-867b-5d5ce46bd188',
  'e11192d2-f470-47f6-ad4a-478ee500d257',
  '2e319485-5e3d-4af7-874c-6779c0fb22f2'
);

-- Cascade xoá: equipment_units f442b925 + equipment_stock + website_products
-- thue-iphone-16-pro-sl (0 ảnh, thay bằng trang thue-iphone-16-pro sẵn có).
delete from public.equipment_types
where id = '5f55dd65-81e9-476f-8d23-8ac7eba19089';
