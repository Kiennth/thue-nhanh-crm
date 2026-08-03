-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone XR bên Booqable sang
-- cho iPhone XR bên CRM mới". Đối chiếu Booqable API (10 đơn, 10 SL)
-- khớp 100% với custom_name 'iPhone XR - Orange, 64GB' bên CRM.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone XR';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPHONEXR-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'iPhone XR - Orange, 64GB';
end $$;
