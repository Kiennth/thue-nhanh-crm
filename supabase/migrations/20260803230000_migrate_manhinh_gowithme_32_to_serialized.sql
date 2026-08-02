-- CEO 2026-08-03: ngừng dùng "Màn hình tương tác GoWithMe 32-inch (SL)"
-- (theo số lượng) — chuyển hẳn sang "Màn hình tương tác GoWithMe 32-inch"
-- (theo từng sản phẩm, đã có 3 máy thật: GOWITHME-32-HN-01,
-- GOWITHME-32-SG-01/02).
--
-- 21 dòng đơn hàng cũ (19 đơn — 1 đơn BQ11838 đang chuẩn bị), toàn bộ
-- quantity = 1. deposit_amount 2 mã GIỐNG NHAU (1.000.000đ) nên không
-- cần override cọc.
do $$
declare
  v_old_type_id uuid := 'ece21ea1-cb11-4cab-a1e9-77dd972bff34';
  v_old_unit_id uuid := 'b04cc0ca-f9ba-435d-bce2-7c00b3648210';
  v_new_type_id uuid := 'c8f149aa-d492-4c70-b8da-d2f409aa41df';
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

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
