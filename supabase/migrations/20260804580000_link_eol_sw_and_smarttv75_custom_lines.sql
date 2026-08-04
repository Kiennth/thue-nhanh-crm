-- CEO 2026-08-04: 2 xác nhận liên tiếp:
--   1) "EOL SW chính là Nintendo Switch" — 49 dòng, 53 SL, phân đều
--      round-robin qua serial thật có sẵn.
--   2) "Smart TV 75-inch 4K UHD [EOL] là TV 4K 75-inch" — 2 biến thể
--      hãng (SAMSUNG 75DU8000: 15 dòng, TCL 75P638: 19 dòng), tạo 1
--      serial riêng mỗi hãng.
do $$
declare
  v_sw_type_id uuid;
  v_tv_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  -- 1) EOL SW -> Nintendo Switch
  select id into v_sw_type_id from public.equipment_types where name = 'Nintendo Switch';
  if v_sw_type_id is not null then
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = 'EOL SW' and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, 'EOL SW', 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;

    if not exists (select 1 from public.equipment_instances where equipment_type_id = v_sw_type_id and status = 'available') then
      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_sw_type_id, 'NSW-01', 'available');
    end if;

    with lines as (
      select id, row_number() over (order by created_at, id) - 1 as rn
      from public.order_equipment where custom_name = 'EOL SW'
    ),
    instances as (
      select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
      from public.equipment_instances where equipment_type_id = v_sw_type_id and status = 'available'
    )
    update public.order_equipment oe
    set equipment_type_id = v_sw_type_id, custom_name = null, equipment_instance_id = ins.id
    from lines l join instances ins on ins.rn = l.rn % ins.total
    where oe.id = l.id;
  end if;

  -- 2) Smart TV 75-inch 4K UHD [EOL] -> TV 4k 75-inch
  select id into v_tv_type_id from public.equipment_types where name = 'TV 4k 75-inch';
  if v_tv_type_id is not null then
    for v_multi in
      select id, order_id, quantity, unit_price, custom_name from public.order_equipment
      where custom_name in ('Smart TV 75-inch 4K UHD [EOL] - SAMSUNG 75DU8000', 'Smart TV 75-inch 4K UHD [EOL] - TCL 75P638')
        and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_multi.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_tv_type_id, 'TV75-SAMSUNG-01', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_tv_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'Smart TV 75-inch 4K UHD [EOL] - SAMSUNG 75DU8000';

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_tv_type_id, 'TV75-TCL-01', 'available')
    returning id into v_inst_id;
    update public.order_equipment
    set equipment_type_id = v_tv_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'Smart TV 75-inch 4K UHD [EOL] - TCL 75P638';
  end if;
end $$;
