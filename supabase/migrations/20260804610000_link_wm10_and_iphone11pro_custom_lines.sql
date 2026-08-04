-- CEO 2026-08-04: 3 xác nhận liên tiếp:
--   1) "Microphone không dây K&F WM10" + "EOL111 cũng là Mic không dây
--      K&F WM10" — gộp cả 2 nguồn (4 dòng/9 SL + 7 dòng/7 SL) vào cùng
--      1 unit.
--   2) "EOL IP11PRO là iphone 11 Pro" — 10 dòng, 10 SL.
do $$
declare
  v_wm10_type uuid;
  v_wm10_unit uuid;
  v_ip11pro_type uuid;
  v_inst_id uuid;
begin
  select id into v_wm10_type from public.equipment_types where name = 'Mic không dây K&F WM10';
  if v_wm10_type is not null then
    select id into v_wm10_unit from public.equipment_units where equipment_type_id = v_wm10_type limit 1;
    if v_wm10_unit is null then
      insert into public.equipment_units (equipment_type_id, brand_model)
      values (v_wm10_type, 'K&F WM10')
      returning id into v_wm10_unit;
    end if;
    update public.order_equipment
    set equipment_type_id = v_wm10_type, custom_name = null, equipment_unit_id = v_wm10_unit
    where custom_name in ('Microphone không dây K&F WM10', 'EOL111');
  end if;

  select id into v_ip11pro_type from public.equipment_types where name = 'iPhone 11 Pro';
  if v_ip11pro_type is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_ip11pro_type, 'IPHONE11PRO-01', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_ip11pro_type, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'EOL IP11PRO';
  end if;
end $$;
