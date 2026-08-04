-- CEO 2026-08-04: 3 xác nhận liên tiếp:
--   1) "EOLBODAM chính là Bộ đàm Xiaomi" — 14 dòng, 69 SL (theo số
--      lượng, dùng lại unit có sẵn).
--   2) "[EOL] LG UltraFine Ergo Stand 32UN880-B chính là Màn hình 4K
--      32-inch biến thể LG ERGO" — 13 dòng, tạo 1 serial riêng.
--   3) "[EOL] Samsung The Space LS32R750UEEXXV chính là Màn hình 4K
--      32-inch biến thể SAMSUNG The Space" — 10 dòng, 11 SL, tạo 1
--      serial riêng.
do $$
declare
  v_bodam_type uuid;
  v_bodam_unit uuid;
  v_manhinh_type uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  -- 1) EOLBODAM -> Bộ đàm Xiaomi
  select id into v_bodam_type from public.equipment_types where name = 'Bộ đàm Xiaomi';
  if v_bodam_type is not null then
    select id into v_bodam_unit from public.equipment_units where equipment_type_id = v_bodam_type limit 1;
    if v_bodam_unit is null then
      insert into public.equipment_units (equipment_type_id, brand_model)
      values (v_bodam_type, 'Bộ đàm Xiaomi')
      returning id into v_bodam_unit;
    end if;
    update public.order_equipment
    set equipment_type_id = v_bodam_type, custom_name = null, equipment_unit_id = v_bodam_unit
    where custom_name = 'EOLBODAM';
  end if;

  -- 2) + 3) Màn hình 4K 32-inch — LG Ergo + Samsung The Space
  select id into v_manhinh_type from public.equipment_types where name = 'Màn hình 4K 32-inch';
  if v_manhinh_type is not null then
    -- LG Ergo (13 dòng, không dòng nào quantity > 1)
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_manhinh_type, 'MANHINH4K32-LGERGO-01', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_manhinh_type, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = '[EOL]  LG UltraFine Ergo Stand 32UN880-B';

    -- Samsung The Space (10 dòng, 11 SL — tách dòng quantity > 1 trước)
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = '[EOL] Samsung The Space LS32R750UEEXXV 32 inch Ultra HD 4K 60Hz' and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, '[EOL] Samsung The Space LS32R750UEEXXV 32 inch Ultra HD 4K 60Hz', 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_manhinh_type, 'MANHINH4K32-SSSPACE-01', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_manhinh_type, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = '[EOL] Samsung The Space LS32R750UEEXXV 32 inch Ultra HD 4K 60Hz';
  end if;
end $$;
