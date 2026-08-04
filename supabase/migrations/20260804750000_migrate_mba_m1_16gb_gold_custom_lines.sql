-- CEO 2026-08-04: "MacBook Air 13.3-inch M1 16GB 256GB - Gold chính là
-- MacBook Air 13-inch M1 16GB RAM biến thể màu Gold" — 5 dòng order_equipment
-- mồ côi (1 dòng quantity=9, đơn BQ872 thuê 9 máy cùng lúc ~3 tháng), tổng
-- 98.700.000đ, 0 đơn đang mở nên không cần đóng băng cọc.
--
-- Peak trùng lịch có TRỌNG SỐ theo quantity = 9 (đúng bằng đơn BQ872, 4 đơn
-- còn lại đều diễn ra SAU khi BQ872 kết thúc nên không cộng dồn thêm). Type
-- này đã có sẵn 1 instance (MBAM1-16GB-01) nhưng KHÔNG rõ màu thật (chưa
-- từng gắn biến thể, đã có 22 dòng lịch sử khác dùng chung) nên không đụng
-- vào — tạo mới 9 instance riêng gắn biến thể Gold, 9 dòng của BQ872 lấy
-- đúng 9 instance khác nhau (không trùng trong cùng 1 đơn), 4 dòng còn lại
-- round-robin qua lại cùng pool 9 instance đó.
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
  select id into v_type_id from public.equipment_types where name = 'MacBook Air 13-inch M1 16GB RAM';
  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'Gold';

  if v_type_id is null or v_unit_id is null then
    return;
  end if;

  -- tách dòng quantity=9 (đơn BQ872) thành 9 dòng quantity=1
  select order_id into v_split_order_id from public.order_equipment
  where custom_name = 'MacBook Air 13.3-inch M1 16GB 256GB - Gold' and quantity > 1;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 16GB 256GB - Gold' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'MacBook Air 13.3-inch M1 16GB 256GB - Gold', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  -- 9 instance mới, gắn biến thể Gold
  for i in 1..9 loop
    v_code := 'MBAM1-16GB-GOLD-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
    values (v_type_id, v_unit_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  -- 9 dòng của BQ872: mỗi dòng 1 instance riêng biệt (đúng thứ tự)
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 16GB 256GB - Gold' and order_id = v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_ids[v_idx + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;

  -- các đơn còn lại (khác BQ872): round-robin qua cùng pool 9 instance
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 16GB 256GB - Gold' and order_id <> v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id,
        custom_name = null,
        equipment_instance_id = v_inst_ids[(v_idx % 9) + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
