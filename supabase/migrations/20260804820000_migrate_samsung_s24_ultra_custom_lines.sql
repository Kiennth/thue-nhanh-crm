-- CEO 2026-08-04: "Điện thoại Samsung S24 Ultra chính là Điện thoại
-- Samsung S24 Ultra" — 29 dòng order_equipment mồ côi (9 dòng quantity>1),
-- tổng 67.875.925,93đ, 0 đơn đang mở nên không cần đóng băng cọc. Sản phẩm
-- chưa từng dùng trong đơn nào — tạo mới 6 instance (đúng peak trùng lịch
-- có trọng số = 6, vài đơn thuê 6 máy cùng lúc), gán theo từng đơn để
-- không trùng instance trong cùng 1 đơn.
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
  select id into v_type_id from public.equipment_types where name = 'Điện thoại Samsung S24 Ultra';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Điện thoại Samsung S24 Ultra' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Điện thoại Samsung S24 Ultra', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  for i in 1..6 loop
    v_code := 'S24U-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name = 'Điện thoại Samsung S24 Ultra'
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name = 'Điện thoại Samsung S24 Ultra' and order_id = v_order.order_id
      order by id
    loop
      update public.order_equipment
      set equipment_type_id = v_type_id,
          custom_name = null,
          equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % 6) + 1]
      where id = v_line.id;
      v_pos := v_pos + 1;
    end loop;
    v_cursor := v_cursor + v_pos;
  end loop;
end $$;
