-- CEO 2026-08-03: tiếp tục rà soát nhóm "KHÔNG DÙNG" trong 7.417 dòng đơn
-- hàng tự do — dò ngược catalog thật của Booqable (bằng SKU) để giải mã
-- các mã tắt (VD "MX T70" = Loa tháp Samsung MX-T70/XV, "TAB9" = Samsung
-- Galaxy Tab S9, "IP9" = iPad Gen 9 10.2-inch theo CEO xác nhận trực
-- tiếp). Gắn 16 nhóm (452 dòng gốc) vào đúng sản phẩm hiện có trong danh
-- mục.
--
-- 2 sản phẩm đích chưa có biến thể/serial nào: "Microsoft Xbox Wireless
-- Controller" (theo số lượng — tạo biến thể mặc định) và "iPad Pro M2
-- 11-inch" (theo từng sản phẩm — tạo serial tạm).
--
-- Nhóm "theo từng sản phẩm" (individual) có dòng quantity > 1 được tách
-- thành nhiều dòng quantity = 1 trước khi gắn — giữ nguyên unit_price,
-- tổng line_total không đổi.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_multi record;
  i integer;
begin
  -- Playstation 5 Blu-ray/Digital -> Playstation 5 (kèm 2 tay cầm)
  v_type_id := '81716ee0-0c56-4dbe-b742-4d6ac573402e';
  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where custom_name in ('[ KHÔNG DÙNG SP NÀY] PS5 - Blueray', '[ KHÔNG DÙNG SP NÀY] PS5 - Digital') and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[ KHÔNG DÙNG SP NÀY] PS5 - Blueray', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment
    where custom_name in ('[ KHÔNG DÙNG SP NÀY] PS5 - Blueray', '[ KHÔNG DÙNG SP NÀY] PS5 - Digital')
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total
  where oe.id = l.id;

  -- Các nhóm "theo số lượng" (quantity) — chỉ cần gắn equipment_unit_id,
  -- không cần tách dòng quantity > 1.

  -- GF65
  v_type_id := '6511d56c-bd0a-4391-83b0-27181490bdae';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] GF65';

  -- MX T70
  v_type_id := '64781001-56a4-4c58-8ac4-13fab5846991';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] MX T70';

  -- Xbox Wireless Controller (chưa có biến thể — tạo mặc định)
  v_type_id := 'ed79bbe9-2f41-4d5b-a0d1-492268ae9c51';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  if v_unit_id is null then
    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type_id, 'Microsoft Xbox Wireless Controller') returning id into v_unit_id;
  end if;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] Tay cầm Microsoft Xbox Wireless Controller';

  -- Apple Pencil 2
  v_type_id := '222214b5-3467-43ec-8f5e-345429a6655f';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] Pencil 2';

  -- Samsung S21 | S21 FE
  v_type_id := 'ab0c1a40-be5d-4705-ba89-773e9159e69a';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] Điện thoại Samsung S21 FE  5G';

  -- Ổ cứng di động SSD 2TB - Samsung T7 Shield
  v_type_id := '5eabc062-f023-410b-bc2c-98eb244c6bf1';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name in ('[KHÔNG DÙNG] T7 Shield 2TB - Beige', '[KHÔNG DÙNG] T7 Shield 2TB - Black');

  -- Apple TV - 1080P
  v_type_id := 'ae7d9512-455c-480e-bfe0-09fb418ba1b0';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG MÃ NÀY] Apple TV 4K';

  -- Chromecast with Google TV
  v_type_id := 'a7265797-62c0-446e-86d8-a976b1653226';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG} GG CC';

  -- iPhone 12
  v_type_id := '82f03188-2d97-45e7-ab54-aaac6be0515b';
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = '[KHÔNG DÙNG] iP12 - iPhone 12';

  -- Các nhóm "theo từng sản phẩm" (individual) — tách quantity > 1 rồi gắn
  -- round-robin qua serial thật (hoặc serial tạm nếu chưa có).

  -- iPad Pro M2 12.9-inch
  v_type_id := '82975e31-3dda-4adb-bb79-9d5f291fb862';
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[KHÔNG DÙNG] IPADPRO129M2 - Wi-Fi + 5G' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[KHÔNG DÙNG] IPADPRO129M2 - Wi-Fi + 5G', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = '[KHÔNG DÙNG] IPADPRO129M2 - Wi-Fi + 5G'
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;

  -- iPad Pro M1 11-inch (toàn bộ đã quantity = 1, không cần tách)
  v_type_id := 'b62ae8b5-5e8d-47be-86a4-bf5c9b9e058c';
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = '[KHÔNG DÙNG] IPPROM111 - Wi-Fi + 5G'
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;

  -- iPad Pro M2 11-inch (chưa có serial thật — tạo serial tạm)
  v_type_id := '90603585-9453-4d3a-bba7-d90290a0c8d1';
  if not exists (select 1 from public.equipment_instances where equipment_type_id = v_type_id and status = 'available') then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, 'IPADPROM211-01', 'available');
  end if;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = '[KHONG DUNG] IPPROm211'
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;

  -- Ổ cứng di động SSD 4TB (T7S 4T)
  v_type_id := '44d2ac14-3107-4168-9b45-f31c4089d6dd';
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[KHÔNG DÙNG] T7S 4T - Black' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[KHÔNG DÙNG] T7S 4T - Black', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = '[KHÔNG DÙNG] T7S 4T - Black'
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;

  -- Samsung Galaxy Tab S9 (TAB9)
  v_type_id := 'dcb5084d-1380-4477-b5cf-dbda59c96b2a';
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[KHÔNG DÙNG] TAB9 - Wi-Fi' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[KHÔNG DÙNG] TAB9 - Wi-Fi', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name = '[KHÔNG DÙNG] TAB9 - Wi-Fi'
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;

  -- iPad Gen 9 10.2-inch (IP9 — CEO xác nhận trực tiếp)
  v_type_id := '420914bd-bcb9-4677-8f54-0a677483bf1a';
  for v_multi in
    select id, order_id, quantity, unit_price, custom_name from public.order_equipment
    where custom_name in ('IP9 { KHÔNG DÙNG MÃ NÀY ) - Wi-Fi Only', 'IP9 { KHÔNG DÙNG MÃ NÀY ) - WiFi 4G') and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, v_multi.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment where custom_name in ('IP9 { KHÔNG DÙNG MÃ NÀY ) - Wi-Fi Only', 'IP9 { KHÔNG DÙNG MÃ NÀY ) - WiFi 4G')
  ), instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances where equipment_type_id = v_type_id and status = 'available'
  )
  update public.order_equipment oe set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total where oe.id = l.id;
end $$;
