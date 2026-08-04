-- CEO 2026-08-04: 4 xác nhận liên tiếp cho các mã EOL nhỏ:
--   1) "EOL 14PRO (Purple, 256GB) là iPhone 14 Pro" — 2 dòng.
--   2) "EOL M2 11 (Space Gray, 128GB) là iPad Pro M2 11 inch" — 2 dòng.
--   3) "EOL001 (H4N) là Máy ghi âm Zoom H4N" — 2 dòng (theo số lượng).
--   4) "EOL01 là GoPro Media Mod" — 1 dòng, 2 SL (theo số lượng).
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 14 Pro';
  if v_type_id is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, 'IPHONE14PRO-02', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'EOL 14PRO - Purple, 256GB';
  end if;

  select id into v_type_id from public.equipment_types where name = 'iPad Pro M2 11 inch';
  if v_type_id is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, 'IPADPROM211-04', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'EOL M2 11 - Space Gray, 128GB, WI-Fi Only';
  end if;

  select id into v_type_id from public.equipment_types where name = 'Máy ghi âm Zoom H4N';
  if v_type_id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
    if v_unit_id is not null then
      update public.order_equipment
      set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
      where custom_name = 'EOL001 - H4N';
    end if;
  end if;

  select id into v_type_id from public.equipment_types where name = 'GoPro Media Mod';
  if v_type_id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
    if v_unit_id is not null then
      update public.order_equipment
      set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
      where custom_name = 'EOL01';
    end if;
  end if;
end $$;
