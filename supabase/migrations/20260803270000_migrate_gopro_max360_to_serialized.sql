-- CEO 2026-08-03: ngừng dùng "Máy quay 360o GoPro MAX 360 (SL)" (theo số
-- lượng) — chuyển hẳn sang "GoPro MAX 360" (theo từng sản phẩm, đã có 2
-- máy thật: GO-MAX-HN-01, GO-MAX-SG-01).
--
-- 5 dòng đơn hàng cũ (5 đơn — 1 đơn BQ12075 đang vận hành/xử lý sự cố),
-- toàn bộ quantity = 1.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 2.000.000đ, mới 1.000.000đ,
-- giảm) — CEO đã xác nhận chấp nhận đơn BQ12075 giảm cọc dự kiến theo
-- đúng catalog SKU mới.
do $$
declare
  v_old_type_id uuid := 'a1f0ab9a-37f8-4164-8ad9-ba49172e50da';
  v_old_unit_id uuid := '244b9175-95c9-462f-a086-e0bad1e37afe';
  v_new_type_id uuid := 'db9bbf3e-ce1d-424b-8415-ba2ae76c0ad2';
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
