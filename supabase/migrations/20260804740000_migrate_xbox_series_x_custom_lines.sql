-- CEO 2026-08-04: "Máy chơi games Microsoft Xbox Series X chính là Xbox
-- Series X (kèm 2 tay cầm)" — 77 dòng order_equipment mồ côi (3 dòng
-- quantity>1), tổng 104.500.000đ, 0 đơn đang mở nên không cần đóng băng
-- cọc. Catalog product này chưa từng dùng trong đơn nào (0 dòng đã gắn) và
-- có sẵn 2 instance chưa hề đụng tới (X-HN-01/02) — khác vụ PS5 Digital
-- (đã có lịch sử mập mờ), nên tái sử dụng an toàn, chỉ tạo thêm 2 instance
-- mới (X-HN-03/04) cho đủ 4 = đúng peak trùng lịch thực tế.
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[];
  v_code text;
  v_line record;
  v_idx integer := 0;
begin
  select id into v_type_id from public.equipment_types where name = 'Xbox Series X (kèm 2 tay cầm)';
  if v_type_id is null then
    return;
  end if;

  -- tách 3 dòng quantity>1 thành các dòng quantity=1
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Máy chơi games Microsoft Xbox Series X' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Máy chơi games Microsoft Xbox Series X', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  -- dùng lại 2 instance có sẵn (X-HN-01/02, chưa từng gắn đơn nào) + tạo mới 2
  select array_agg(id) into v_inst_ids from public.equipment_instances
  where equipment_type_id = v_type_id and identifier_code in ('X-HN-01', 'X-HN-02');

  for i in 3..4 loop
    v_code := 'X-HN-0' || i;
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_multi;
    v_inst_ids := array_append(v_inst_ids, v_multi.id);
  end loop;

  -- round-robin gắn 82 dòng vào 4 instance
  for v_line in
    select id from public.order_equipment
    where custom_name = 'Máy chơi games Microsoft Xbox Series X'
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id,
        custom_name = null,
        equipment_instance_id = v_inst_ids[(v_idx % 4) + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
