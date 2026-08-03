-- CEO 2026-08-04: "chuyển lịch sử thuê Apple TV - 1080P (SL) qua cho
-- Apple TV 1080P" — SKU cũ theo số lượng (deposit 0đ, dữ liệu cũ chưa
-- từng thu cọc), SKU mới theo từng sản phẩm (deposit 500.000đ). 0 đơn
-- đang mở tại thời điểm chuyển nên an toàn dù deposit thay đổi.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types where name = 'Apple TV - 1080P (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'Apple TV 1080P';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

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

  select id into v_inst_id from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available' limit 1;
  if v_inst_id is null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, 'APPLETV1080P-01', 'available')
    returning id into v_inst_id;
  end if;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id in (select id from public.equipment_units where equipment_type_id = v_old_type_id);
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
