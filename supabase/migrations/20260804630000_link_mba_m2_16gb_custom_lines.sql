-- CEO 2026-08-04: "[EOL] MBA M2 16GB (13.6-inch) chính là MacBook Air
-- 13 inch M2 16GB RAM bên CRM mới". 11 dòng, 20 SL, 0 đơn đang mở.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'MacBook Air 13 inch M2 16GB RAM';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[EOL] MBA M2 16GB - 13.6-inch' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[EOL] MBA M2 16GB - 13.6-inch', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'MBAM2-16GB-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = '[EOL] MBA M2 16GB - 13.6-inch';
end $$;
