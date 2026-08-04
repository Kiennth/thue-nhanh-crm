-- CEO 2026-08-04: "[EOL] MacBook Air 13 inch M1 - 16GB, 256GB chính là
-- MacBook Air 13-inch M1 16GB RAM" — 50 dòng order_equipment mồ côi (3 dòng
-- quantity>1), tổng 67.100.000đ, 0 đơn đang mở nên không cần đóng băng
-- cọc. Không nêu màu (khác vụ Gold trước đó) — tạo mới 4 instance KHÔNG
-- gắn biến thể (đúng peak trùng lịch có trọng số = 4), không đụng vào
-- instance Gold vừa tạo cũng như instance cũ MBAM1-16GB-01 (không rõ màu,
-- đã có lịch sử dùng chung từ trước).
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[] := '{}';
  v_inst_id uuid;
  v_code text;
  v_order record;
  v_line record;
  v_cursor integer := 0;
  v_pos integer;
begin
  select id into v_type_id from public.equipment_types where name = 'MacBook Air 13-inch M1 16GB RAM';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[EOL] MacBook Air 13 inch M1   - 16GB, 256GB' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[EOL] MacBook Air 13 inch M1   - 16GB, 256GB', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  -- MBAM1-16GB-01 đã tồn tại từ trước (instance chung, không rõ màu) nên bắt đầu từ 02
  for i in 2..5 loop
    v_code := 'MBAM1-16GB-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name = '[EOL] MacBook Air 13 inch M1   - 16GB, 256GB'
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name = '[EOL] MacBook Air 13 inch M1   - 16GB, 256GB' and order_id = v_order.order_id
      order by id
    loop
      update public.order_equipment
      set equipment_type_id = v_type_id,
          custom_name = null,
          equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % 4) + 1]
      where id = v_line.id;
      v_pos := v_pos + 1;
    end loop;
    v_cursor := v_cursor + v_pos;
  end loop;
end $$;
