-- CEO 2026-08-03: dò tiếp các cặp "cũ theo số lượng / mới theo từng sản
-- phẩm" không có đuôi "(SL)" nhưng tên gần như trùng nhau (khớp 100% sau
-- chuẩn hoá) — CEO xác nhận 16 cặp là cùng 1 sản phẩm thật, không phải 2
-- đời/model khác nhau (khác các trường hợp bị loại như DJI Mic 1/2, Zoom
-- H4/H8 — những cặp đó là sản phẩm thật khác nhau, không gộp).
--
-- Các dòng quantity > 1 (Smart TV 55/75/85/98-inch, Nintendo Switch, Xbox
-- + Kinect, iMac 5K) được tách thành nhiều dòng quantity = 1 trước khi
-- chuyển — giữ nguyên unit_price, tổng line_total không đổi.
--
-- MacBook Air M2 16GB 13-inch: deposit đổi 10tr -> 5tr, có 1 đơn đang mở
-- — CEO đã xác nhận chấp nhận giảm cọc theo đúng catalog SKU mới. Các cặp
-- còn lại hoặc deposit không đổi, hoặc không có đơn nào đang mở nên không
-- ảnh hưởng thực tế.
--
-- Tất cả sản phẩm đích đều chưa có serial thật — mỗi sản phẩm tạo đúng 1
-- serial tạm (mã đánh dấu rõ là tạm) để gắn toàn bộ lịch sử vào.
do $$
declare
  v_old_type_id uuid;
  v_old_unit_id uuid;
  v_new_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  -- Màn hình tương tác 75-inch 4K -> Màn hình tương tác 75-inch
  v_old_type_id := '87b0bcb2-99aa-4794-8a35-07424cd5f44e';
  v_old_unit_id := '4e9e6d72-0ee5-4890-8bba-83fec8119e34';
  v_new_type_id := 'd599be08-2401-426f-bc6e-c2002707874e';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MNHNHTNGTC75IN-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Máy quay Insta360 One X5 -> Insta360 ONE X5
  v_old_type_id := '779405c7-7b0f-4d9d-9c25-e3e702ca96c6';
  v_old_unit_id := '3e441c68-6728-4c62-8aac-adae02423df4';
  v_new_type_id := 'a8f1b064-c957-4c5d-a77d-120232eba6ea';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'INSTA360ONEX5-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Máy tính bảng Samsung Galaxy Tab S9 - Wi-Fi Only -> Samsung Galaxy Tab S9
  v_old_type_id := 'f1016119-43cf-449f-9528-b1821bff7b64';
  v_old_unit_id := '36f87316-2d68-4879-b993-39f01ae03a89';
  v_new_type_id := 'dcb5084d-1380-4477-b5cf-dbda59c96b2a';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'SAMSUNGGALAXYT-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Smart TV 4K 55-inch -> TV 4k 55-inch
  v_old_type_id := 'd47e64a8-8a9d-4d09-97aa-3e1151c5bf7c';
  v_old_unit_id := '1cccf7cb-f5a5-4351-9b8f-eccd964a05e5';
  v_new_type_id := 'fbd1fc50-a452-44ad-95c6-db11d7b45420';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'TV4K55INCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Smart TV 4K 75-inch  - SAMSUNG -> TV 4k 75-inch
  v_old_type_id := '0eaf1517-dde5-4c58-a66c-42fa9f444e98';
  v_old_unit_id := '8fbf2f45-36a3-4967-a2a1-3e9727cdbf42';
  v_new_type_id := '04d38f27-32e8-4da3-9104-8381fc969e9d';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'TV4K75INCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Smart TV 4K 85-inch -> TV 4k 85-inch
  v_old_type_id := '89faea22-db29-4d99-b353-193d4bf8d1c6';
  v_old_unit_id := 'de315afa-fac8-4506-aaa5-d9c066cb6160';
  v_new_type_id := '0169dd2a-1bfc-48e1-bb56-fe40169858da';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'TV4K85INCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Smart TV 4K 98-inch - TCL 98 -> TV 4k 98-inch
  v_old_type_id := '80d896d2-e9af-4add-ac23-a1a48f6cca79';
  v_old_unit_id := '271da942-0a34-492d-b4c4-386a45db82e6';
  v_new_type_id := 'd013daf9-85db-48af-ad74-614b69d43b71';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'TV4K98INCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- MacBook Air M2 16GB RAM 256GB SSD 13-inch - 13.6 inch -> MacBook Air 13-inch M2 16GB RAM
  v_old_type_id := '7d69cea7-d101-4823-bfa1-31a477faf6d1';
  v_old_unit_id := 'b78b6cb2-7089-4f42-bddb-737f4d966832';
  v_new_type_id := '4a574dc7-0661-44f9-ae0a-e82be212462c';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MACBOOKAIR13IN-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Mac Mini M4 16GB RAM - 256GB -> Mac Mini M4 16GB RAM
  v_old_type_id := '212ce6de-76c9-432e-a9e1-f75fa683ac22';
  v_old_unit_id := '41e03a36-dc49-4571-892d-d87a3f034b7c';
  v_new_type_id := '6523570d-09a2-471e-9138-28b6cbf5728f';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MACMINIM416GBR-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Mac Mini M4 24GB RAM - 256GB -> Mac Mini M4 24GB RAM
  v_old_type_id := '40d5cc03-7690-4cc5-a83d-6f2c0b2a56cc';
  v_old_unit_id := '92e304e2-be42-40e0-8332-0927f238c62d';
  v_new_type_id := '27b5af1b-54db-4dd2-b314-cfa6b8d5080f';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MACMINIM424GBR-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Máy chơi games Nintendo Switch -> Nintendo Switch
  v_old_type_id := '0335d785-16b3-4423-aec2-f70d23681aec';
  v_old_unit_id := 'b0cd4b85-fd43-4b0f-acbe-fe5b2cec18c1';
  v_new_type_id := '146a1730-f790-4887-8de9-38e16cac50db';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'NINTENDOSWITCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Máy chơi games Xbox + Kinect -> Xbox + Kinect
  v_old_type_id := '9e02b346-4069-425c-9a40-ab375659ce21';
  v_old_unit_id := '16e0b204-9052-4e0d-b9ba-beb63a7a08ad';
  v_new_type_id := '4c2fd398-002b-4240-9ddc-f80df9fb7e5d';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'XBOXKINECT-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- iMac 5K 27 inch 2017 - i5 32GB RAM 512GB -> iMac 5K 27-inch
  v_old_type_id := '1d1e145b-a29b-4ece-b213-8241f37bdd01';
  v_old_unit_id := '57544244-503b-43e5-8fdf-458fef27b943';
  v_new_type_id := '14799d6a-5c38-41f9-97f0-dd6c55f15a34';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'IMAC5K27INCH-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- ổ cứng để bàn HDD 20TB Western Digital My Book Duo WDBFBE0200JBK-SESN -> Ổ cứng để bàn HDD 20TB
  v_old_type_id := '9433c399-f3a1-457a-90ab-64df688e45f6';
  v_old_unit_id := '4e3136d9-742e-48f3-95d9-032bb92cddb7';
  v_new_type_id := 'b0f830d3-1848-4153-9d37-0e5a43756cc2';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'CNGBNHDD20TB-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Ổ cứng di động SSD 4TB 1000MB/s - Samsung T7 Shield -> Ổ cứng di động SSD 4TB
  v_old_type_id := '647b9b4a-c8c4-4d2f-817c-396701fe54c7';
  v_old_unit_id := '650cc9bd-3dfc-416b-ac05-c4fbadd83017';
  v_new_type_id := '44d2ac14-3107-4168-9b45-f31c4089d6dd';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'CNGDINGSSD4TB-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
  -- Màn hình tương tác 55 inch -> Màn hình tương tác 55-inch
  v_old_type_id := '791ccd66-7aca-4005-ab60-49f673f50a50';
  v_old_unit_id := 'e4963390-cfce-4660-8132-bfbbd6e104f4';
  v_new_type_id := 'ab1d5674-4ce4-4451-ad3e-04f50ad391f8';

  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MNHNHTNGTC55IN-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
