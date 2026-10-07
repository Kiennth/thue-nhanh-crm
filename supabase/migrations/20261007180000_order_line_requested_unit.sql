-- Biến thể khách YÊU CẦU trên dòng máy serial (CEO 2026-10-07, PO13160: chọn
-- "SAMSUNG M7" của Màn hình 4K 32 inch nhưng ảnh sai, tự gán ra máy ACER).
-- Dòng serial không được dùng equipment_unit_id (trigger: hàng theo từng sản
-- phẩm không dùng biến thể số lượng — và deliver/return_order_stock coi dòng
-- có unit mà chưa có máy là hàng SỐ LƯỢNG), nên biến thể chọn lúc lên đơn bị
-- bỏ. Cột riêng requested_unit_id: hiện ảnh/tên biến thể, ô chọn serial + Tự
-- gán chỉ lấy máy đúng biến thể.
alter table public.order_equipment
  add column if not exists requested_unit_id uuid references public.equipment_units(id) on delete set null;
