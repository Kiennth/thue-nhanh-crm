-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 12 (SL) / iPhone 12
-- Mini (SL) sang bản theo dõi serial". Cả 2 đều 0 đơn đang mở, không
-- cần đóng băng cọc dù deposit đổi 0đ -> 1.000.000đ.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
  v_pair record;
begin
  for v_pair in
    select * from (values
      ('iPhone 12 (SL)', 'iPhone 12', 'IPHONE12-01'),
      ('iPhone 12 Mini (SL)', 'iPhone 12 Mini', 'IPHONE12MINI-01')
    ) as t(old_name, new_name, code)
  loop
    select id into v_old_type_id from public.equipment_types where name = v_pair.old_name;
    select id into v_new_type_id from public.equipment_types where name = v_pair.new_name;
    if v_old_type_id is null or v_new_type_id is null then
      continue;
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

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, v_pair.code, 'available')
    returning id into v_inst_id;

    update public.order_equipment
    set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
    where equipment_type_id = v_old_type_id;

    delete from public.equipment_instances where equipment_type_id = v_old_type_id;
    delete from public.equipment_stock where equipment_unit_id = v_unit_id;
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end loop;
end $$;
