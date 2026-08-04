-- CEO 2026-08-04: "EOL13 là MacbooK Pro 13 inhc i5 8GB RAM" (mã cuối
-- cùng trong đợt rà soát toàn bộ tiền tố EOL bên Booqable). 1 dòng.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'MacbooK Pro 13 inhc i5 8GB RAM';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'MBP13I5-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'EOL13';
end $$;
