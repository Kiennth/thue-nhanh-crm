-- CEO 2026-08-04: "Máy chơi games Sony PlayStation 5 - Digital chính là
-- sản phẩm Playstation 5 (kèm 2 tay cầm), biến thể Digital nhé" — 98 dòng
-- order_equipment mồ côi (1 dòng quantity=3), tổng 123.180.000đ, cả 98 đơn
-- đều đã nhập_kho_bảo_trì (0 đơn đang mở) nên không cần đóng băng cọc.
--
-- Playstation 5 (kèm 2 tay cầm) là serialized (individual) và đã có sẵn
-- unit biến thể "Digital"/"Blueray" nhưng chưa instance nào được gắn biến
-- thể — các instance sẵn có không rõ là Digital hay Blueray thật (Booqable
-- chỉ ghi tên dòng hàng dạng text, không có serial), nên KHÔNG gán bừa vào
-- instance có sẵn (tránh đoán sai dữ liệu vật lý). Tạo mới 5 instance riêng
-- (đúng bằng peak trùng lịch thực tế trong 98 đơn) gắn biến thể Digital,
-- round-robin theo id.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[] := '{}';
  v_inst_id uuid;
  v_code text;
  v_line record;
  v_idx integer := 0;
begin
  select id into v_type_id from public.equipment_types where name = 'Playstation 5 (kèm 2 tay cầm)';
  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'Digital';

  if v_type_id is null or v_unit_id is null then
    return;
  end if;

  -- tách dòng quantity=3 (đơn 2949db07-...) thành 3 dòng quantity=1
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Máy chơi games Sony PlayStation 5 - Digital' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Máy chơi games Sony PlayStation 5 - Digital', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  -- 5 instance mới, gắn biến thể Digital
  for i in 1..5 loop
    v_code := 'PS5-DG-' || lpad(i::text, 2, '0');
    insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
    values (v_type_id, v_unit_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  -- round-robin gắn 100 dòng vào 5 instance
  for v_line in
    select id from public.order_equipment
    where custom_name = 'Máy chơi games Sony PlayStation 5 - Digital'
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id,
        custom_name = null,
        equipment_instance_id = v_inst_ids[(v_idx % 5) + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
