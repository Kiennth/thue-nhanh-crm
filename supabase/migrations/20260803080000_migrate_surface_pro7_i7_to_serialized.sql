-- CEO 2026-08-03: ngừng dùng "Surface Pro 7 i7 16GB RAM" (theo số lượng) —
-- chuyển hẳn sang "Surface Pro 7 i7 | 16GB | 256GB" (theo từng sản phẩm,
-- biến thể Silver / Black, hiện có 9 máy thật: SFP-7-HN-01..04, SFP-7-SG-01..05).
--
-- 65 dòng đơn hàng cũ (32 đơn — 31 đã nhập kho & bảo trì, 1 đơn BQ11839
-- đang chuẩn bị), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (5.000.000đ) nên không cần override cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := '66ed9621-7017-4574-b9de-3eb3cee1da19';
  v_old_unit_id uuid := 'db748bae-6aae-4ccb-8824-9c1b344e1117';
  v_new_type_id uuid := '4f6abda3-353a-439e-8363-f42eac84779a';
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
