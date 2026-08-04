-- CEO 2026-08-04: "chuyển lịch sử thuê của Mini5 bên Booqable sang cho
-- iPad Mini 5 7.9 inch bên CRM mới". Đối chiếu Booqable API (13 đơn,
-- ~28 SL) khớp với 2 biến thể custom_name 'Mini5 - Wi-Fi Only' (26 SL)
-- + 'Mini5 - Wi-Fi + LTE' (2 SL). 1 đơn đang mở (BQ7370) — đóng băng
-- cọc dự kiến (0đ, vì đơn chưa có sản phẩm cho thuê nào khác) trước
-- khi gắn.
do $$
declare
  v_type_id uuid;
  v_inst_wifi uuid;
  v_inst_lte uuid;
  v_order_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'iPad Mini 5 7.9 inch';
  if v_type_id is null then
    return;
  end if;

  select o.id into v_order_id from public.orders o where o.order_code = 'BQ7370';
  if v_order_id is not null then
    update public.orders set deposit_override_amount = 0
    where id = v_order_id and deposit_override_amount is null;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPADMINI5-WIFI-01', 'available')
  returning id into v_inst_wifi;
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPADMINI5-LTE-01', 'available')
  returning id into v_inst_lte;

  for v_multi in
    select id, order_id, quantity, unit_price, custom_name from public.order_equipment
    where custom_name in ('Mini5 - Wi-Fi Only', 'Mini5 - Wi-Fi + LTE') and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, v_multi.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_wifi
  where custom_name = 'Mini5 - Wi-Fi Only';
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_lte
  where custom_name = 'Mini5 - Wi-Fi + LTE';
end $$;
