-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 15 bên Booqable /
-- iPhone 15 (SL) sang cho iPhone 15 bên CRM mới" — đối chiếu Booqable
-- API xác nhận cả 2 đơn (BQ6157, BQ6851) đã dùng đúng type "iPhone 15
-- (SL)" bên CRM. Deposit đổi 0đ -> 5.000.000đ nhưng 0 đơn đang mở nên
-- an toàn, không cần đóng băng cọc.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types where name = 'iPhone 15 (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'iPhone 15';

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

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'IPHONE15-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
