-- CEO 2026-08-04: "chuyển lịch sử thuê của EOL 43-inch bên Booqable
-- sang cho TV 4K 43 inch bên CRM mới". Đối chiếu Booqable API (12 đơn,
-- 19 SL) khớp 100% với 3 biến thể hãng: Sony 43X75K (4), Xiaomi
-- L43MB-AUSEA (9), Samsung (6) — tạo 1 serial riêng mỗi hãng.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_name text;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'TV 4K 43 inch';
  if v_type_id is null then
    return;
  end if;

  foreach v_name in array array['EOL 43-inch - Sony 43X75K', 'EOL 43-inch - Xiaomi L43MB-AUSEA', 'EOL 43-inch - Samsung']
  loop
    if exists (select 1 from public.order_equipment where custom_name = v_name) then
      for v_multi in
        select id, order_id, quantity, unit_price from public.order_equipment
        where custom_name = v_name and quantity > 1
      loop
        update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
        for i in 2..v_multi.quantity loop
          insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
          values (v_multi.order_id, v_name, 1, v_multi.unit_price, v_multi.unit_price);
        end loop;
      end loop;

      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_type_id, 'TV43-' || upper(regexp_replace(split_part(v_name, ' - ', 2), '[^a-zA-Z0-9]', '', 'g')), 'available')
      returning id into v_inst_id;

      update public.order_equipment
      set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
      where custom_name = v_name;
    end if;
  end loop;
end $$;
