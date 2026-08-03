-- CEO 2026-08-04: "chuyển lịch sử thuê của [KHÔNG DÙNG] iPhone 8 PLUS
-- bên Booqable sang cho iPhone 8 PLUS bên CRM mới" + "chuyển lịch sử
-- thuê của Điện thoại iPhone 8 Plus bên Booqable sang cho iPhone 8
-- PLUS bên CRM mới" — Booqable có 2 sản phẩm lịch sử khác nhau cho
-- cùng 1 model điện thoại, cả 2 đều gộp về đúng 1 sản phẩm CRM.
--
-- Đối chiếu qua Booqable API (product_trackers, khớp đúng số lượng
-- pickup/return từng đơn):
--   1) "[KHÔNG DÙNG] iPhone 8 PLUS" (34 đơn) <-> CRM custom_name
--      'KHÔNG DÙNG  - Gold, 64GB' + 'KHÔNG DÙNG  - Black, 64GB' +
--      'iPhone 8 Plus 64GB Gold' (chỉ những dòng thuộc đúng 34 đơn này
--      — chuỗi 'iPhone 8 Plus 64GB Gold' còn xuất hiện ở 3 đơn khác
--      (BQ19, BQ641, BQ1120) KHÔNG thuộc sản phẩm này, cố tình bỏ qua,
--      chưa xác định nguồn gốc, để lại chờ xác nhận sau).
--   2) "Điện thoại iPhone 8 Plus" bên Booqable (17 đơn, tổng 66 SL)
--      khớp chính xác 100% với custom_name 'Điện thoại iPhone 8 Plus'
--      bên CRM (17 dòng, 66 SL, 44.350.370đ) — không mơ hồ.
--
-- Cả 2 nhóm gộp về chung 1 serial tạm IPHONE8PLUS-01 (chưa có serial
-- thật nào lúc chuyển).
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
  v_order_codes text[] := array[
    'BQ47','BQ56','BQ238','BQ263','BQ385','BQ405','BQ480','BQ557','BQ631','BQ751','BQ819',
    'BQ1101','BQ1102','BQ1103','BQ1226','BQ1374','BQ1375','BQ2054','BQ2055','BQ2056','BQ2057',
    'BQ2058','BQ2059','BQ2260','BQ2508','BQ2686','BQ2707','BQ2708','BQ2709','BQ2710','BQ2711',
    'BQ2738','BQ2745','BQ2886'
  ];
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 8 PLUS';
  if v_type_id is null then
    return;
  end if;

  select id into v_inst_id from public.equipment_instances
  where equipment_type_id = v_type_id and status = 'available' limit 1;
  if v_inst_id is null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, 'IPHONE8PLUS-01', 'available')
    returning id into v_inst_id;
  end if;

  -- nhóm 1: các dòng "KHÔNG DÙNG - <màu>, 64GB" (mọi đơn) + dòng
  -- "iPhone 8 Plus 64GB Gold" CHỈ trong danh sách 34 đơn xác nhận ở trên
  for v_multi in
    select oe.id, oe.order_id, oe.quantity, oe.unit_price
    from public.order_equipment oe
    join public.orders o on o.id = oe.order_id
    where oe.custom_name in ('KHÔNG DÙNG  - Gold, 64GB', 'KHÔNG DÙNG  - Black, 64GB')
       or (oe.custom_name = 'iPhone 8 Plus 64GB Gold' and o.order_code = any(v_order_codes))
  loop
    if v_multi.quantity > 1 then
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, equipment_type_id, equipment_instance_id, quantity, unit_price, line_total)
        values (v_multi.order_id, v_type_id, v_inst_id, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end if;
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where id = v_multi.id;
  end loop;

  -- nhóm 2: "Điện thoại iPhone 8 Plus" — khớp 100%, không cần lọc theo đơn
  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Điện thoại iPhone 8 Plus'
  loop
    if v_multi.quantity > 1 then
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, equipment_type_id, equipment_instance_id, quantity, unit_price, line_total)
        values (v_multi.order_id, v_type_id, v_inst_id, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end if;
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where id = v_multi.id;
  end loop;
end $$;
