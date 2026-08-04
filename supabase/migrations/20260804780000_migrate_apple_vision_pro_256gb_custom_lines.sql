-- CEO 2026-08-04: "Kính thực tế ảo Apple Vision Pro - 256GB chính là Apple
-- Vision Pro biến thể 256GB" — 26 dòng order_equipment mồ côi (1 dòng
-- quantity=2), tổng 68.900.000đ, 0 đơn đang mở nên không cần đóng băng
-- cọc. Sản phẩm chưa từng dùng trong đơn nào — tạo mới 2 instance gắn
-- biến thể 256GB (đúng peak trùng lịch có trọng số = 2), đơn có dòng
-- quantity=2 lấy 2 instance khác nhau, còn lại round-robin qua lại.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_split_order_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[] := '{}';
  v_inst_id uuid;
  v_code text;
  v_line record;
  v_idx integer := 0;
begin
  select id into v_type_id from public.equipment_types where name = 'Apple Vision Pro';
  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = '256GB';

  if v_type_id is null or v_unit_id is null then
    return;
  end if;

  select order_id into v_split_order_id from public.order_equipment
  where custom_name = 'Kính thực tế ảo Apple Vision Pro - 256GB' and quantity > 1;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Kính thực tế ảo Apple Vision Pro - 256GB' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Kính thực tế ảo Apple Vision Pro - 256GB', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  for i in 1..2 loop
    v_code := 'VISIONPRO-256-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
    values (v_type_id, v_unit_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  -- đơn có dòng quantity=2: mỗi dòng 1 instance riêng
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'Kính thực tế ảo Apple Vision Pro - 256GB' and order_id = v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_ids[v_idx + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;

  -- các đơn còn lại: round-robin qua 2 instance
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'Kính thực tế ảo Apple Vision Pro - 256GB' and order_id <> v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id,
        custom_name = null,
        equipment_instance_id = v_inst_ids[(v_idx % 2) + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
