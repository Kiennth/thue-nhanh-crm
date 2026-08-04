-- CEO 2026-08-04: "Màn hình quảng cáo Standee LED (cảm ứng) - 50-inch
-- chính là Standee Led 50-inch Touch" — 13 dòng order_equipment mồ côi (7
-- dòng quantity=2), tổng 61.220.000đ, 0 đơn đang mở nên không cần đóng
-- băng cọc. Sản phẩm chưa từng dùng trong đơn nào — tạo mới 4 instance
-- (đúng peak trùng lịch có trọng số = 4), gán theo từng đơn (con trỏ xoay
-- vòng liên tục) để không trùng instance trong cùng 1 đơn.
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
  select id into v_type_id from public.equipment_types where name = 'Standee Led 50-inch Touch';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Màn hình quảng cáo Standee LED (cảm ứng) - 50-inch' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Màn hình quảng cáo Standee LED (cảm ứng) - 50-inch', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  for i in 1..4 loop
    v_code := 'STANDEE50-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name = 'Màn hình quảng cáo Standee LED (cảm ứng) - 50-inch'
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name = 'Màn hình quảng cáo Standee LED (cảm ứng) - 50-inch' and order_id = v_order.order_id
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
