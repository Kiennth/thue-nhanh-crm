-- CEO 2026-08-03: ngừng dùng "Laptop MSI Katana i7 13620H | 16GB DDR5 |
-- 512GB SSD | RTX 4050 6GB | 144Hz" (theo số lượng) — chuyển hẳn sang
-- "MSI Katana i7 13620H | 16GB DDR5 | 512GB SSD | RTX 4050 6GB IPS 144Hz"
-- (theo từng sản phẩm, hiện có 8 máy thật: KATANA-16-HN-01..04,
-- KATANA-16-SG-01..04).
--
-- 191 dòng đơn hàng cũ (110 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (10.000.000đ) nên không cần override cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := 'f57dc443-bc55-4051-9bd8-51ebe4bfa858';
  v_old_unit_id uuid := '102b08ca-8551-4635-911b-893102820f63';
  v_new_type_id uuid := '0c45aa46-516c-4cf9-b9d7-b223d2cd9b5a';
begin
  with old_lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment
    where equipment_type_id = v_old_type_id
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn,
           count(*) over () as total
    from public.equipment_instances
    where equipment_type_id = v_new_type_id
  )
  update public.order_equipment oe
  set equipment_type_id = v_new_type_id,
      equipment_unit_id = null,
      equipment_instance_id = i.id
  from old_lines ol
  join instances i on i.rn = ol.rn % i.total
  where oe.id = ol.id;

  -- Mã cũ giờ không còn dòng đơn hàng nào — xoá hẳn khỏi danh mục, kèm các
  -- bản ghi AUTO-* mồ côi và dòng tồn kho, chưa từng được đơn hàng hay thẻ
  -- RFID nào tham chiếu.
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
