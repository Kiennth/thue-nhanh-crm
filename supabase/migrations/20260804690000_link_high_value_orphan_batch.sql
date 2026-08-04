-- CEO 2026-08-04: "mày scan lại xem cái nào có nhiều lịch sử giao dịch,
-- số tiền lớn thì tìm gắn zô" — quét lại toàn bộ order_equipment.
-- custom_name còn mồ côi, xếp theo giá trị giảm dần, tìm những tên khớp
-- CHÍNH XÁC với 1 sản phẩm catalog sau khi bỏ hậu tố " - <biến thể>"
-- (không dùng thuật toán mờ theo điểm số như trước — chỉ nhận khi tên
-- gốc, sau khi bỏ hậu tố, khớp NGUYÊN VĂN 1 sản phẩm, để tránh lặp lại
-- lỗi gộp nhầm biến thể). 22 nhóm khớp chắc chắn, tổng ~314 triệu đồng.
--
-- Một số đơn đang mở bị ảnh hưởng (BQ12159, BQ12174, BQ12170, BQ12160)
-- đã đóng băng cọc dự kiến (đều 0đ tại thời điểm chuyển, vì trước đó
-- các dòng này chưa tính vào cọc) trước khi gắn — xem điều kiện
-- deposit_override_amount is null trong khối lệnh bên dưới.
do $$
declare
  v_type record;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  v_order record;
  i integer;
  v_pair record;
begin
  -- đóng băng cọc cho các đơn đang mở của những dòng sắp được gắn
  for v_order in
    select distinct o.id, o.customer_id
    from public.orders o
    join public.order_equipment oe on oe.order_id = o.id
    where oe.custom_name in (
      'DJI Mic 2 - 2TX + 1 RX', 'Xe Scooter Điện - E22', 'Xe Scooter Điện - KATAEV1', 'Xe Scooter Điện - WEKEISI',
      'Booth Thực Tế Ảo VR - TV 43-inch không kèm kính', 'Booth Thực Tế Ảo VR - TV 65-inch',
      'Photobooth - 2H Cơ Bản', 'Photobooth - 4H Tiêu Chuẩn', 'DJI Osmo Action 4 - Adventure Combo',
      'iPhone 12 Pro - Silver, 256GB', 'Màn hình di động - 15.6inch 1080P', 'Màn hình di động - 15.6inch 2K 144Hz',
      'Máy tập đạp xe YESOUL M1 - White', 'Màn Hình 1080P 27-inch  - MH Phẳng Samsung LS27D300GAEXXV',
      'Máy Chạy Bộ Thông Minh KingSmith - R1 PRO', 'iPad Gen 9 10.2-inch - 64GB Wi-Fi LTE',
      ' iPad Pro M5 13 inch - Wi-Fi + 5G LTE', 'Loa Kiểm Âm Thonet & Vander Kumpel (Cặp) - Trắng',
      'Loa Kiểm Âm Thonet & Vander Kumpel (Cặp) - Đen', 'Tai Nghe Bluetooth Chụp Tai - QCY H2 Pro - màu Trắng',
      'Tai Nghe Bluetooth Chụp Tai - QCY H2 Pro - màu Đen', 'iPad Mini 5 7.9 inch - Wi-Fi + LTE'
    )
    and o.status <> 'nhap_kho_bao_tri' and o.deposit_override_amount is null
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

  -- 1) DJI Mic 2 (individual, instance riêng)
  select id into v_type from public.equipment_types where name = 'DJI Mic 2 (2 TX 1 RX)';
  if v_type.id is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'DJIMIC2-02', 'available') returning id into v_inst_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'DJI Mic 2 - 2TX + 1 RX';
  end if;

  -- 2) Xe Scooter Điện — 3 biến thể hãng mới (E22, KATAEV1, WEKEISI)
  select id into v_type from public.equipment_types where name = 'Xe Scooter Điện';
  if v_type.id is not null then
    for v_pair in select * from (values ('E22'),('KATAEV1'),('WEKEISI')) as t(brand) loop
      insert into public.equipment_units (equipment_type_id, brand_model)
      values (v_type.id, v_pair.brand) returning id into v_unit_id;
      for v_multi in
        select id, order_id, quantity, unit_price from public.order_equipment
        where custom_name = 'Xe Scooter Điện - ' || v_pair.brand and quantity > 1
      loop
        update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
        for i in 2..v_multi.quantity loop
          insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
          values (v_multi.order_id, 'Xe Scooter Điện - ' || v_pair.brand, 1, v_multi.unit_price, v_multi.unit_price);
        end loop;
      end loop;
      update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
      where custom_name = 'Xe Scooter Điện - ' || v_pair.brand;
    end loop;
  end if;

  -- 3) Booth Thực Tế Ảo VR — dùng lại unit "TV 43-inch" có sẵn, tạo mới "TV 65-inch"
  select id into v_type from public.equipment_types where name = 'Booth Thực Tế Ảo VR';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model = 'TV 43-inch';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Booth Thực Tế Ảo VR - TV 43-inch không kèm kính';

    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type.id, 'TV 65-inch') returning id into v_unit_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Booth Thực Tế Ảo VR - TV 65-inch';
  end if;

  -- 4) Photobooth — dùng lại unit "2H Cơ Bản" có sẵn, tạo mới "4H Tiêu Chuẩn"
  select id into v_type from public.equipment_types where name = 'Photobooth';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model = '2H Cơ Bản';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Photobooth - 2H Cơ Bản';

    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type.id, '4H Tiêu Chuẩn') returning id into v_unit_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Photobooth - 4H Tiêu Chuẩn';
  end if;

  -- 5) DJI Osmo Action 4 (individual)
  select id into v_type from public.equipment_types where name = 'DJI Osmo Action 4';
  if v_type.id is not null then
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = 'DJI Osmo Action 4 - Adventure Combo' and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, 'DJI Osmo Action 4 - Adventure Combo', 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'DJIACTION4-01', 'available') returning id into v_inst_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'DJI Osmo Action 4 - Adventure Combo';
  end if;

  -- 6) iPhone 12 Pro (individual)
  select id into v_type from public.equipment_types where name = 'iPhone 12 Pro';
  if v_type.id is not null then
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = 'iPhone 12 Pro - Silver, 256GB' and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, 'iPhone 12 Pro - Silver, 256GB', 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'IPHONE12PRO-01', 'available') returning id into v_inst_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'iPhone 12 Pro - Silver, 256GB';
  end if;

  -- 7) Màn Hình Di Động — dùng lại 2 unit thông số đã tạo ở migration EOL MBDP
  select id into v_type from public.equipment_types where name = 'Màn Hình Di Động';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model ilike '%1080p%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Màn hình di động - 15.6inch 1080P';
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model ilike '%2k 144hz%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Màn hình di động - 15.6inch 2K 144Hz';
  end if;

  -- 8) YESOUL M1 màu Trắng — dùng lại unit có sẵn
  select id into v_type from public.equipment_types where name = 'Máy tập đạp xe YESOUL M1';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model ilike '%trắng%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Máy tập đạp xe YESOUL M1 - White';
  end if;

  -- 9) Màn Hình 1080P 27-inch — dùng lại unit Samsung LS27D300GAEXXV có sẵn
  select id into v_type from public.equipment_types where name = 'Màn Hình 1080P 27-inch';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model ilike '%ls27d300%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Màn Hình 1080P 27-inch  - MH Phẳng Samsung LS27D300GAEXXV';
  end if;

  -- 10) Máy Chạy Bộ Thông Minh KingSmith R1 PRO — dùng lại unit có sẵn
  select id into v_type from public.equipment_types where name = 'Máy Chạy Bộ Thông Minh KingSmith';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id and brand_model ilike '%r1 pro%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Máy Chạy Bộ Thông Minh KingSmith - R1 PRO';
  end if;

  -- 11) iPad Gen 9 10.2-inch — round-robin qua serial thật có sẵn
  select id into v_type from public.equipment_types where name = 'iPad Gen 9 10.2-inch';
  if v_type.id is not null then
    with lines as (
      select id, 0 as rn from public.order_equipment where custom_name = 'iPad Gen 9 10.2-inch - 64GB Wi-Fi LTE'
    ),
    instances as (
      select id, 0 as rn from public.equipment_instances
      where equipment_type_id = v_type.id and status = 'available'
      order by identifier_code limit 1
    )
    update public.order_equipment oe
    set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = ins.id
    from lines l join instances ins on ins.rn = l.rn
    where oe.id = l.id;
  end if;

  -- 12) iPad Pro M5 13 inch — round-robin qua 2 serial thật có sẵn
  select id into v_type from public.equipment_types where name = 'iPad Pro M5 13 inch';
  if v_type.id is not null then
    with lines as (
      select id, 0 as rn from public.order_equipment where custom_name = ' iPad Pro M5 13 inch - Wi-Fi + 5G LTE'
    ),
    instances as (
      select id, 0 as rn from public.equipment_instances
      where equipment_type_id = v_type.id and status = 'available'
      order by identifier_code limit 1
    )
    update public.order_equipment oe
    set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = ins.id
    from lines l join instances ins on ins.rn = l.rn
    where oe.id = l.id;
  end if;

  -- 13) Loa Kiểm Âm Thonet & Vander Kumpel (Cặp) — 2 màu, instance riêng
  select id into v_type from public.equipment_types where name = 'Loa Kiểm Âm Thonet & Vander Kumpel (Cặp)';
  if v_type.id is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'LOATHONETVANDER-TRANG-01', 'available') returning id into v_inst_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'Loa Kiểm Âm Thonet & Vander Kumpel (Cặp) - Trắng';

    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type.id, 'LOATHONETVANDER-DEN-01', 'available') returning id into v_inst_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'Loa Kiểm Âm Thonet & Vander Kumpel (Cặp) - Đen';
  end if;

  -- 14) Tai Nghe Bluetooth Chụp Tai QCY H2 Pro — Trắng dùng unit có sẵn, Đen tạo mới
  select id into v_type from public.equipment_types where name = 'Tai Nghe Bluetooth Chụp Tai';
  if v_type.id is not null then
    select id into v_unit_id from public.equipment_units
    where equipment_type_id = v_type.id and brand_model ilike '%qcy%' and brand_model ilike '%trắng%';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Tai Nghe Bluetooth Chụp Tai - QCY H2 Pro - màu Trắng';

    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type.id, 'QCY H2 Pro - màu Đen') returning id into v_unit_id;
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
    where custom_name = 'Tai Nghe Bluetooth Chụp Tai - QCY H2 Pro - màu Đen';
  end if;

  -- 15) iPad Mini 5 7.9 inch — gắn vào serial IPADMINI5-LTE-01 có sẵn (đúng chuẩn LTE)
  select id into v_type from public.equipment_types where name = 'iPad Mini 5 7.9 inch';
  if v_type.id is not null then
    select id into v_inst_id from public.equipment_instances
    where equipment_type_id = v_type.id and identifier_code = 'IPADMINI5-LTE-01';
    update public.order_equipment set equipment_type_id = v_type.id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = 'iPad Mini 5 7.9 inch - Wi-Fi + LTE';
  end if;
end $$;
