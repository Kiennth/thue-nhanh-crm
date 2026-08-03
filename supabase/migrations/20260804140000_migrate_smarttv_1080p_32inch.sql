-- CEO 2026-08-04: "chuyển lịch sử thuê của Smart TV 1080p 32-inch (SL)
-- sang Smart TV 1080p 32-inch" — CEO đã tạo sẵn type serialize mới
-- trong CRM nhưng chưa đổi tên (còn "(SL)" trùng SKU cũ) — đổi tên
-- thành "Smart TV 1080p 32-inch" trước khi chuyển. Deposit không đổi
-- (500.000đ cả 2 bên).
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types
  where name = 'Smart TV 1080p 32-inch (SL)' and tracking_type = 'quantity';
  select id into v_new_type_id from public.equipment_types
  where name = 'Smart TV 1080p 32-inch (SL)' and tracking_type = 'individual';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  update public.equipment_types set name = 'Smart TV 1080p 32-inch' where id = v_new_type_id;

  for v_multi in
    select id, order_id, quantity, unit_price, equipment_unit_id from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, v_multi.equipment_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'SMARTTV1080P32-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  select id into v_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
