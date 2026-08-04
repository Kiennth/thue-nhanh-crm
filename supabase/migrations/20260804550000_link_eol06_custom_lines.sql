-- CEO 2026-08-04: "EOL 06 bên Booqable đã nhập vào CRM mới chưa?" —
-- chưa, gắn ngay. Đối chiếu Booqable API (2 đơn, 2 SL) khớp 100% với
-- custom_name 'EOL 06'.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPad Pro M1 12.9 inch';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPADPROM129-02', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'EOL 06';
end $$;
