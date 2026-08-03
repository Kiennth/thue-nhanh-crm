-- CEO 2026-08-04: serialize "Smart TV 65-inch 4K" — CEO yêu cầu trực
-- tiếp qua chat: "tạo biến thể tương ứng và chuyển hết lịch sử thuê của
-- Smart TV 65-inch 4K (SL) qua Smart TV 65-inch 4K". SKU cũ (theo số
-- lượng, deposit 1.000.000đ) có 7 biến thể theo hãng khác nhau — tạo 1
-- serial riêng cho từng hãng ở SKU mới (theo từng sản phẩm, deposit
-- giữ nguyên 1.000.000đ) rồi chuyển từng dòng đúng theo hãng gốc, không
-- gộp về round-robin để không làm lẫn hãng.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit record;
  v_inst_id uuid;
  v_multi record;
  i integer;
  v_code text;
begin
  select id into v_old_type_id from public.equipment_types where name = 'Smart TV 65-inch 4K (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'Smart TV 65-inch 4K';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  -- tách các dòng quantity > 1 trước, giữ nguyên equipment_unit_id gốc
  for v_multi in
    select id, order_id, quantity, unit_price, equipment_unit_id from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, v_multi.equipment_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  -- tạo 1 serial riêng cho mỗi biến thể (hãng) cũ, map đúng theo unit gốc
  for v_unit in select id, brand_model from public.equipment_units where equipment_type_id = v_old_type_id loop
    v_code := upper(regexp_replace(v_unit.brand_model, '[^a-zA-Z0-9]', '', 'g'));
    v_code := left(v_code, 12) || '-01';
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, v_code, 'available')
    returning id into v_inst_id;

    update public.order_equipment
    set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
    where equipment_type_id = v_old_type_id and equipment_unit_id = v_unit.id;
  end loop;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id in (select id from public.equipment_units where equipment_type_id = v_old_type_id);
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
