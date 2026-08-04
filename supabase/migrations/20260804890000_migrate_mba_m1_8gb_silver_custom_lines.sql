-- CEO 2026-08-04: "MacBook Air 13.3-inch M1 8GB - Silver, 256GB chính là
-- MacBook Air M1 8GB RAM 13 inch" — 9 dòng order_equipment mồ côi (1 dòng
-- quantity=6, cùng đơn BQ872 đã thuê 9 máy Gold 16GB ở migration trước —
-- 1 sự kiện lớn thuê nhiều dòng MacBook Air khác nhau cùng lúc), tổng
-- 45.980.000đ, 0 đơn đang mở nên không cần đóng băng cọc.
--
-- Type này chưa có unit biến thể nào (0 unit) và có sẵn 1 instance chung
-- không rõ màu (MBAM1-8GB-01, đã có 82 dòng lịch sử khác) — không đụng
-- vào, tạo mới unit "Silver" + 6 instance riêng. 6 dòng của BQ872 lấy
-- đúng 6 instance khác nhau (không trùng trong cùng 1 đơn).
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
  select id into v_type_id from public.equipment_types where name = 'MacBook Air M1 8GB RAM 13 inch';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (v_type_id, 'Silver')
  returning id into v_unit_id;

  select order_id into v_split_order_id from public.order_equipment
  where custom_name = 'MacBook Air 13.3-inch M1 8GB - Silver, 256GB' and quantity > 1;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 8GB - Silver, 256GB' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'MacBook Air 13.3-inch M1 8GB - Silver, 256GB', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  for i in 1..6 loop
    v_code := 'MBAM1-8GB-SILVER-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
    values (v_type_id, v_unit_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  -- 6 dòng của BQ872: mỗi dòng 1 instance riêng biệt
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 8GB - Silver, 256GB' and order_id = v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_ids[v_idx + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;

  -- các đơn còn lại: round-robin qua cùng pool 6 instance
  v_idx := 0;
  for v_line in
    select id from public.order_equipment
    where custom_name = 'MacBook Air 13.3-inch M1 8GB - Silver, 256GB' and order_id <> v_split_order_id
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id,
        custom_name = null,
        equipment_instance_id = v_inst_ids[(v_idx % 6) + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
