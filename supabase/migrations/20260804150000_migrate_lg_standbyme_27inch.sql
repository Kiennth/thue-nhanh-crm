-- CEO 2026-08-04: "chuyển lịch sử thuê của TV LG StandbyME 27 inch sang
-- LG Stanbyme 27-inch" — deposit không đổi (1.000.000đ cả 2 bên). SKU
-- mới đã có sẵn 3 serial thật (STANBYME-HN-01, STANBYME-SG-01,
-- STANBYME-SG-02) — phân đều round-robin theo thứ tự identifier_code.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types where name = 'TV LG StandbyME 27 inch';
  select id into v_new_type_id from public.equipment_types where name = 'LG Stanbyme 27-inch';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  select id into v_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, v_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where equipment_type_id = v_old_type_id
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available'
  )
  update public.order_equipment oe
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total
  where oe.id = l.id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
