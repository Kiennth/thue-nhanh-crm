-- CEO 2026-08-04: "chuyển lịch sử thuê của [EOL] TAKSTAR bên Booqable
-- sang cho Loa trợ giảng bên CRM mới, biến thể TAKSTAR E300W". Đối
-- chiếu Booqable API (3 đơn, 3 SL) khớp 100% với custom_name
-- '[EOL] TAKSTAR'.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types
  where name = 'Loa trợ giảng' and tracking_type = 'individual';
  if v_type_id is null then
    return;
  end if;

  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'TAKSTAR E300W';
  if v_unit_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
  values (v_type_id, v_unit_id, 'LOATROGIANG-TAKSTAR-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = '[EOL] TAKSTAR';
end $$;
