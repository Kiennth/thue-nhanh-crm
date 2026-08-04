-- CEO 2026-08-04: "[EOL] RC chính là Xe điều khiển RC bên CRM mới".
-- Kiểm tra thêm sản phẩm "Xe điều khiển từ xa" bên Booqable (CEO hỏi
-- có phải cùng 1 thứ) — 0 lịch sử thuê, không có gì để chuyển. Chỉ gắn
-- '[EOL] RC' (4 dòng, 14 SL).
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Xe điều khiển RC';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (v_type_id, 'Xe điều khiển RC')
  returning id into v_unit_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[EOL] RC';
end $$;
