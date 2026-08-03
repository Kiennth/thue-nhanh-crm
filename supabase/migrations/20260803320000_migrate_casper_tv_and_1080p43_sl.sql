-- CEO 2026-08-03: chuyển tiếp lịch sử thuê của 2 SKU cũ sang sản phẩm
-- serialize đúng, theo yêu cầu trực tiếp qua chat:
--   1) "Smart TV 4K 50-inch - Casper" (theo số lượng, 14 dòng) ->
--      "TV 4K 50-inch" (theo từng sản phẩm, serial thật)
--   2) "Smart TV 1080p 43-inch (SL)" (theo số lượng, 83 dòng, có 2 biến
--      thể/unit khác nhau bên trong) -> "Smart TV 1080p 43-inch" (theo
--      từng sản phẩm) — giữ đúng equipment_unit_id gốc của từng dòng khi
--      tách quantity > 1, không gộp về 1 unit chung.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_multi record;
  v_inst_id uuid;
  i integer;
begin
  -- 1) Smart TV 4K 50-inch - Casper -> TV 4K 50-inch
  select id into v_old_type_id from public.equipment_types where name = 'Smart TV 4K 50-inch - Casper';
  select id into v_new_type_id from public.equipment_types where name = 'TV 4K 50-inch';

  if v_old_type_id is not null and v_new_type_id is not null then
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

    select id into v_inst_id from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available' limit 1;
    if v_inst_id is null then
      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_new_type_id, 'TV4K50INCH-01', 'available')
      returning id into v_inst_id;
    end if;

    with lines as (
      select id, row_number() over (order by created_at, id) - 1 as rn
      from public.order_equipment where equipment_type_id = v_old_type_id
    ),
    instances as (
      select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
      from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available'
    )
    update public.order_equipment oe
    set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = ins.id
    from lines l join instances ins on ins.rn = l.rn % ins.total
    where oe.id = l.id;

    delete from public.equipment_instances where equipment_type_id = v_old_type_id;
    delete from public.equipment_stock where equipment_unit_id in (select id from public.equipment_units where equipment_type_id = v_old_type_id);
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end if;

  -- 2) Smart TV 1080p 43-inch (SL) -> Smart TV 1080p 43-inch
  select id into v_old_type_id from public.equipment_types where name = 'Smart TV 1080p 43-inch (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'Smart TV 1080p 43-inch';

  if v_old_type_id is not null and v_new_type_id is not null then
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

    select id into v_inst_id from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available' limit 1;
    if v_inst_id is null then
      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_new_type_id, 'SMARTTV1080P43-01', 'available')
      returning id into v_inst_id;
    end if;

    with lines as (
      select id, row_number() over (order by created_at, id) - 1 as rn
      from public.order_equipment where equipment_type_id = v_old_type_id
    ),
    instances as (
      select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
      from public.equipment_instances where equipment_type_id = v_new_type_id and status = 'available'
    )
    update public.order_equipment oe
    set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = ins.id
    from lines l join instances ins on ins.rn = l.rn % ins.total
    where oe.id = l.id;

    delete from public.equipment_instances where equipment_type_id = v_old_type_id;
    delete from public.equipment_stock where equipment_unit_id in (select id from public.equipment_units where equipment_type_id = v_old_type_id);
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end if;
end $$;
