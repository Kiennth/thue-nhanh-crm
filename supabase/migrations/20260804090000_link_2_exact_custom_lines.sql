-- CEO 2026-08-04: tiếp tục rà soát nhóm ~6.200 dòng đơn hàng mồ côi còn
-- lại — 2 tên tự do khớp CHÍNH XÁC (chỉ khác cách viết) với sản phẩm đã
-- có trong danh mục, gắn thẳng không cần hỏi lại:
--   'DJI Mic Mini (2 TX)' -> 'DJI Mic Mini 2 (2 TX)' (theo số lượng)
--   'Apple TV - 4K' -> 'Apple TV 4K' (theo từng sản phẩm, serial thật)
do $$
declare
  v_type record;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  -- DJI Mic Mini (2 TX) -> DJI Mic Mini 2 (2 TX)
  select id, tracking_type into v_type from public.equipment_types where name = 'DJI Mic Mini 2 (2 TX)';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id limit 1;
  if v_unit_id is null then
    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type.id, 'DJI Mic Mini 2 (2 TX)')
    returning id into v_unit_id;
  end if;
  update public.order_equipment
  set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'DJI Mic Mini (2 TX)';

  -- Apple TV - 4K -> Apple TV 4K
  select id, tracking_type into v_type from public.equipment_types where name = 'Apple TV 4K';

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Apple TV - 4K' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Apple TV - 4K', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  select id into v_inst_id from public.equipment_instances
  where equipment_type_id = v_type.id and status = 'available' limit 1;
  if v_inst_id is null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'APPLETV4K-01', 'available')
    returning id into v_inst_id;
  end if;

  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = 'Apple TV - 4K'
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type.id and status = 'available'
  )
  update public.order_equipment oe
  set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total
  where oe.id = l.id;
end $$;
