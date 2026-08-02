-- CEO 2026-08-03: ngừng dùng "Màn hình tương tác 65-inch (SL)" (theo số
-- lượng) — chuyển hẳn sang "Màn hình tương tác 65-inch" (theo từng sản
-- phẩm, đã có 7 máy thật: TOUCH-65-HN-01/02, TOUCH-65-SG-01..05).
--
-- 27 dòng đơn hàng cũ (24 đơn — 4 đơn đang mở: BQ12102, BQ11690, BQ11875,
-- BQ11689). 1 dòng quantity=2 được tách thành 2 dòng quantity=1 — tổng
-- tiền không đổi.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 2.000.000đ, mới 5.000.000đ,
-- tăng) — CEO đã xác nhận chấp nhận 4 đơn đang mở tăng cọc dự kiến theo
-- đúng catalog SKU mới.
do $$
declare
  v_old_type_id uuid := '99771c88-5780-4fc7-9cd1-7494125c9f48';
  v_old_unit_id uuid := '79fd2526-d358-4125-a1d0-9cf3c264e7ea';
  v_new_type_id uuid := '290e790f-1b9d-4439-a6bb-df9f07d89536';
  v_multi record;
  i integer;
begin
  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

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
