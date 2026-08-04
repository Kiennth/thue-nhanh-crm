-- CEO 2026-08-04: "Máy quay Insta360 ONE RS 1-Inch Edition chính là
-- Insta360 ONE RS 1-inch Leica Edition" — 49 dòng order_equipment mồ côi
-- (1 dòng quantity=2), tổng 89.680.000đ, 0 đơn đang mở nên không cần đóng
-- băng cọc. Sản phẩm chưa từng dùng trong đơn nào và có sẵn 2 instance
-- chưa hề đụng tới (R1-HN-01, R1-SG-01) — tái sử dụng an toàn, đúng peak
-- trùng lịch = 2, không cần tạo thêm.
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[];
  v_order record;
  v_line record;
  v_cursor integer := 0;
  v_pos integer;
begin
  select id into v_type_id from public.equipment_types where name = 'Insta360 ONE RS 1-inch Leica Edition';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Máy quay Insta360 ONE RS 1-Inch Edition' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Máy quay Insta360 ONE RS 1-Inch Edition', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  select array_agg(id) into v_inst_ids from public.equipment_instances
  where equipment_type_id = v_type_id and identifier_code in ('R1-HN-01', 'R1-SG-01');

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name = 'Máy quay Insta360 ONE RS 1-Inch Edition'
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name = 'Máy quay Insta360 ONE RS 1-Inch Edition' and order_id = v_order.order_id
      order by id
    loop
      update public.order_equipment
      set equipment_type_id = v_type_id,
          custom_name = null,
          equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % 2) + 1]
      where id = v_line.id;
      v_pos := v_pos + 1;
    end loop;
    v_cursor := v_cursor + v_pos;
  end loop;
end $$;
