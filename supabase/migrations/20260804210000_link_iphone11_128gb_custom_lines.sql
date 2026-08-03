-- CEO 2026-08-04: "[EOL] iPhone 11" bên Booqable chỉ có 1 đơn (BQ4173)
-- và đơn đó đã được gắn đúng "iPhone 11" từ migration iPhone 11 (SL)
-- trước đó rồi, không cần làm gì thêm. Nhân tiện phát hiện 4 dòng tự do
-- "iPhone 11 - 128GB" (BQ1310/1399/1500/1495) chưa gắn — CEO xác nhận
-- cũng là "iPhone 11".
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 11';
  select id into v_inst_id from public.equipment_instances
  where equipment_type_id = v_type_id and status = 'available' limit 1;

  if v_type_id is null or v_inst_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'iPhone 11 - 128GB' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'iPhone 11 - 128GB', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'iPhone 11 - 128GB';
end $$;
