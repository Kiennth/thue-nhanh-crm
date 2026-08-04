-- CEO 2026-08-04: "chuyển lịch sử thuê của [EOL] YESOUL bên Booqable
-- sang cho Máy tập đạp xe YESOUL M1 bên CRM mới". Đối chiếu Booqable
-- API (6 đơn, 27 SL) khớp 100% với 2 biến thể custom_name
-- '[EOL] YESOUL - Black' (26 SL) + '[EOL] YESOUL - White' (1 SL) —
-- gắn vào đúng unit màu có sẵn (Black: unit cũ đã có 32 dòng khác;
-- White: unit "màu Trắng" CEO mới tạo, không tạo unit trùng mới).
do $$
declare
  v_type_id uuid;
  v_black_unit uuid;
  v_white_unit uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'Máy tập đạp xe YESOUL M1';
  if v_type_id is null then
    return;
  end if;

  select id into v_black_unit from public.equipment_units
  where equipment_type_id = v_type_id and brand_model ilike '%black%' limit 1;
  select id into v_white_unit from public.equipment_units
  where equipment_type_id = v_type_id and (brand_model ilike '%trắng%' or brand_model ilike '%white%') limit 1;

  if v_black_unit is not null then
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = '[EOL] YESOUL - Black' and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
        values (v_multi.order_id, v_type_id, v_black_unit, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_black_unit
    where custom_name = '[EOL] YESOUL - Black';
  end if;

  if v_white_unit is not null then
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_white_unit
    where custom_name = '[EOL] YESOUL - White';
  end if;
end $$;
