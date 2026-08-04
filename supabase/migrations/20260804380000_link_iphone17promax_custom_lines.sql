-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 17 Pro Max bên
-- Booqable sang cho iPhone 17 Pro Max bên CRM mới". Đối chiếu Booqable
-- API (7 đơn, 8 SL) khớp 100% với 3 biến thể màu custom_name: Silver
-- (4), Deep Blue (3), Cosmic Orange (1) — tạo 1 serial riêng mỗi màu.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_name text;
  v_code text;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 17 Pro Max';
  if v_type_id is null then
    return;
  end if;

  foreach v_name in array array['iPhone 17 Pro Max - Silver', 'iPhone 17 Pro Max - Deep Blue', 'iPhone 17 Pro Max - Cosmic Orange']
  loop
    if exists (select 1 from public.order_equipment where custom_name = v_name) then
      v_code := 'IP17PM-' || upper(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_type_id, v_code, 'available')
      returning id into v_inst_id;

      update public.order_equipment
      set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
      where custom_name = v_name;
    end if;
  end loop;
end $$;
