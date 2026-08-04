-- CEO 2026-08-04: "chuyển lịch sử thuê của EOL MBDP bên Booqable sang
-- cho Màn Hình Di Động bên CRM mới". Đối chiếu Booqable API (4 đơn,
-- 8 SL) khớp 100% với 3 biến thể custom_name theo thông số: 15.6inch
-- 2K 144Hz (3 SL), 15.6inch 1080P 60Hz (1 SL), 16inch 2.5K 144Hz
-- (4 SL) — tạo 1 unit riêng mỗi thông số.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_name text;
  v_spec text;
begin
  select id into v_type_id from public.equipment_types where name = 'Màn Hình Di Động';
  if v_type_id is null then
    return;
  end if;

  foreach v_name in array array[
    'EOL MBDP - 15.6inch, 2K 144Hz',
    'EOL MBDP - 15.6inch, 1080P 60Hz',
    'EOL MBDP - 16inch, 2.5K 144Hz'
  ]
  loop
    if exists (select 1 from public.order_equipment where custom_name = v_name) then
      v_spec := split_part(v_name, ' - ', 2);
      insert into public.equipment_units (equipment_type_id, brand_model)
      values (v_type_id, 'Màn Hình Di Động - ' || v_spec)
      returning id into v_unit_id;

      update public.order_equipment
      set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
      where custom_name = v_name;
    end if;
  end loop;
end $$;
