-- CEO 2026-08-03: ngừng dùng "Meta Quest 3 (SL)" (theo số lượng) — chuyển
-- hẳn sang "Meta Quest 3" (theo từng sản phẩm, hiện có 10 máy thật:
-- Q3-HN-01..05, Q3-SG-01..05).
--
-- 359 dòng đơn hàng cũ (203 đơn — 5 đơn đang mở: BQ11984, BQ11875,
-- BQ4830, BQ4904, BQ4903), toàn bộ quantity = 1. deposit_amount 2 mã
-- GIỐNG NHAU (5.000.000đ) nên không cần override cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := '718b1f49-37cd-4e66-a4e1-9938cc6c02c1';
  v_old_unit_id uuid := '57e61981-6a3f-4efe-9d7c-d0e8ff277f5b';
  v_new_type_id uuid := 'd292729f-0ae6-4e88-b440-3b3ddd56adc8';
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
