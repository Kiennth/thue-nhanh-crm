-- CEO 2026-08-04: "EOL-PS-NAM chính là Playstation 5 (kèm 2 tay cầm)
-- bên CRM mới" — 121 dòng, 122 SL, phân đều round-robin qua 15 serial
-- PS5 thật đã có sẵn.
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'Playstation 5 (kèm 2 tay cầm)';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'EOL-PS-NAM' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'EOL-PS-NAM', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = 'EOL-PS-NAM'
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total
  where oe.id = l.id;
end $$;
