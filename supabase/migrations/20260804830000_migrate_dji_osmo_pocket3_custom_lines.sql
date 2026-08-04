-- CEO 2026-08-04: "DJI Osmo Pocket 3 - STANDARD chính là DJI Osmo Pocket 3
-- Creator Combo trên CRM mới" + "DJI Osmo Pocket 3 Creator Combo cũng
-- chính là DJI Osmo Pocket 3 Combo trên CRM mới" — cả 2 custom_name gộp
-- chung về 1 sản phẩm catalog "DJI Osmo Pocket 3 Combo" (business gộp
-- STANDARD và Creator Combo làm 1 SKU). Tổng 155 dòng order_equipment mồ
-- côi (4 dòng quantity=2), 177.657.500đ, 0 đơn đang mở nên không cần đóng
-- băng cọc. Sản phẩm chưa từng dùng trong đơn nào — tạo mới 5 instance
-- (đúng peak trùng lịch có trọng số = 5, tính gộp cả 2 nguồn), gán theo
-- từng đơn để không trùng instance trong cùng 1 đơn.
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
  select id into v_type_id from public.equipment_types where name = 'DJI Osmo Pocket 3 Combo';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name in ('DJI Osmo Pocket 3 Creator Combo', 'DJI Osmo Pocket 3 - STANDARD') and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      select v_multi.order_id, oe.custom_name, 1, v_multi.unit_price, v_multi.unit_price
      from public.order_equipment oe where oe.id = v_multi.id;
    end loop;
  end loop;

  for i in 1..5 loop
    v_code := 'OSMOPOCKET3-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name in ('DJI Osmo Pocket 3 Creator Combo', 'DJI Osmo Pocket 3 - STANDARD')
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name in ('DJI Osmo Pocket 3 Creator Combo', 'DJI Osmo Pocket 3 - STANDARD')
        and order_id = v_order.order_id
      order by id
    loop
      update public.order_equipment
      set equipment_type_id = v_type_id,
          custom_name = null,
          equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % 5) + 1]
      where id = v_line.id;
      v_pos := v_pos + 1;
    end loop;
    v_cursor := v_cursor + v_pos;
  end loop;
end $$;
