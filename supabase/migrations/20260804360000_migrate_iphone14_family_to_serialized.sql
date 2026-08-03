-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 14 / iPhone 14 Pro /
-- iPhone 14 Pro Max (SL) sang bản theo dõi serial" — 3 yêu cầu liên
-- tiếp, gộp chung 1 migration.
--   1) iPhone 14 (SL) -> iPhone 14: deposit 0đ -> 1tr, 1 đơn đang mở đã
--      có override sẵn (0đ, không đụng).
--   2) iPhone 14 Pro (SL) -> iPhone 14 Pro: deposit 5tr -> 2tr, đóng
--      băng cọc 1 đơn đang mở.
--   3) iPhone 14 Pro Max (SL) -> iPhone 14 Pro Max: deposit 5tr -> 2tr,
--      đóng băng cọc cho 7 đơn đang mở (1 đơn đã có override từ trước,
--      bỏ qua).
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
  v_order record;
  v_multi record;
  i integer;
  v_pair record;
begin
  for v_pair in
    select * from (values
      ('iPhone 14 (SL)', 'iPhone 14', 'IPHONE14-01'),
      ('iPhone 14 Pro (SL)', 'iPhone 14 Pro', 'IPHONE14PRO-01'),
      ('iPhone 14 Pro Max (SL)', 'iPhone 14 Pro Max', 'IPHONE14PROMAX-01')
    ) as t(old_name, new_name, code)
  loop
    select id into v_old_type_id from public.equipment_types where name = v_pair.old_name;
    select id into v_new_type_id from public.equipment_types where name = v_pair.new_name;
    if v_old_type_id is null or v_new_type_id is null then
      continue;
    end if;

    for v_order in
      select distinct o.id, o.customer_id
      from public.orders o
      join public.order_equipment oe on oe.order_id = o.id
      where oe.equipment_type_id = v_old_type_id and o.status <> 'nhap_kho_bao_tri'
        and o.deposit_override_amount is null
    loop
      update public.orders o
      set deposit_override_amount = (
        select round(
          coalesce(sum(coalesce(et.deposit_amount, 0) * l.quantity), 0)
          * coalesce((select c.deposit_percentage from public.customers c where c.id = v_order.customer_id), 100)
          / 100.0 / 1000000
        ) * 1000000
        from public.order_equipment l
        join public.equipment_types et on et.id = l.equipment_type_id
        where l.order_id = v_order.id and et.product_type = 'rental'
      )
      where o.id = v_order.id;
    end loop;

    select id into v_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;

    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where equipment_type_id = v_old_type_id and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
        values (v_multi.order_id, v_old_type_id, v_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, v_pair.code, 'available')
    returning id into v_inst_id;

    update public.order_equipment
    set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
    where equipment_type_id = v_old_type_id;

    delete from public.equipment_instances where equipment_type_id = v_old_type_id;
    delete from public.equipment_stock where equipment_unit_id = v_unit_id;
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end loop;
end $$;
