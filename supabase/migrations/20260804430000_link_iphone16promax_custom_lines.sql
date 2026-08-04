-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 16 Pro Max (2024) bên
-- Booqable sang cho iPhone 16 Pro Max bên CRM mới". Đối chiếu Booqable
-- API (9 đơn, 9 SL) khớp 100% với custom_name 'iPhone 16 Pro Max
-- (2024) - 256GB'. 0 đơn đang mở.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 16 Pro Max';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPHONE16PROMAX-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'iPhone 16 Pro Max (2024) - 256GB';
end $$;
