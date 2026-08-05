-- CEO 2026-08-05: loạt lệnh liên tiếp "chuyển X qua CRM mới, quản lý theo
-- serial" cho 10 sản phẩm mồ côi có nhiều đơn nhất (theo số đơn) chưa có
-- trong catalog. Mỗi sản phẩm: tạo mới catalog (individual), tạo instance
-- theo peak trùng lịch có trọng số + dư nhẹ, tách các dòng quantity>1,
-- gán theo từng đơn (không trùng instance trong cùng 1 đơn). Giá theo giá
-- phổ biến nhất trong lịch sử, cọc là ước tính tham chiếu theo sản phẩm
-- cùng hạng đã có sẵn — CẦN RÀ SOÁT LẠI SAU (CEO xác nhận tinh thần
-- "cứ để con số nào cũng được, tao sẽ cho các kho kiểm tra và rà soát
-- lại" áp dụng cho cả đợt này).
--
-- 2 đơn đang mở bị ảnh hưởng, đã đóng băng cọc (đều 0đ tại thời điểm
-- gắn): BQ3335 (Gimbal DJI Ronin RSC 2), BQ12118 (DJI Osmo Pocket 1).
--
--   Gimbal DJI Ronin SC              300k/ngày cọc 1,2tr   3 instance  20.090.000đ (58 đơn)
--   Gimbal DJI Ronin RSC 2           500k/ngày cọc 2tr      4 instance  62.100.000đ (49 đơn, 1 đơn mở)
--   EcoFlow RIVER Max 576Wh 800W     500k/ngày cọc 2,5tr    3 instance  28.170.000đ (43 đơn)
--   Trạm điện di động Tursan YC600   500k/ngày cọc 2tr      3 instance  26.660.000đ (40 đơn)
--   DJI Osmo Pocket 1                300k/ngày cọc 1,5tr    5 instance  26.500.000đ (38 đơn, 1 đơn mở)
--   DJI Osmo Pocket 2 Creator Combo  500k/ngày cọc 2tr      2 instance  39.020.000đ (39 đơn)
--   Máy chiếu Samsung Freestyle 100  600k/ngày cọc 3tr      3 instance  49.470.000đ (39 đơn)
--   Kính thực tế ảo PICO 4           400k/ngày cọc 2tr      5 instance  39.060.000đ (36 đơn)
--   Cảm biến Kinect V2 Cho Máy Tính  400k/ngày cọc 1tr      4 instance  22.180.000đ (31 đơn)
--   MacBook Air 13-inch i7 8GB 256GB 1,2tr/ngày cọc 6tr     3 instance  30.420.000đ (30 đơn)
--
-- Migration này ghi lại NGUYÊN VĂN những gì đã chạy qua REST (không phải
-- những gì được thực thi lúc đó) — theo đúng quy ước của dự án.
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
  v_inst_ids uuid[];
  v_inst_id uuid;
  v_order record;
  v_line record;
  v_cursor integer;
  v_pos integer;
  v_spec record;
begin
  update public.orders set deposit_override_amount = 0 where order_code = 'BQ3335' and deposit_override_amount is null;
  update public.orders set deposit_override_amount = 0 where order_code = 'BQ12118' and deposit_override_amount is null;

  for v_spec in
    select * from (values
      ('Gimbal DJI Ronin SC', 'Gimbal máy ảnh DJI Ronin SC', 300000, 1200000, 'RONINSC', 3),
      ('Gimbal DJI Ronin RSC 2', 'Gimbal máy ảnh DJI Ronin RSC 2', 500000, 2000000, 'RONINRSC2', 4),
      ('Trạm điện di động EcoFlow RIVER Max 576Wh 800W', 'Trạm điện đi động EcoFlow RIVER Max 576Wh 800W', 500000, 2500000, 'ECOFLOWRIVERMAX', 3),
      ('Trạm điện di động Tursan YC600 - Mint', 'Trạm điện di động Tursan YC600 - Mint', 500000, 2000000, 'TURSANYC600', 3),
      ('DJI Osmo Pocket 1', 'Máy quay DJI Osmo Pocket 1', 300000, 1500000, 'OSMOPOCKET1', 5),
      ('DJI Osmo Pocket 2 Creator Combo', 'Máy quay DJI Osmo Pocket 2 Creator Combo', 500000, 2000000, 'OSMOPOCKET2', 2),
      ('Máy chiếu Samsung Freestyle 100-inch', 'Máy chiếu Samsung Freestyle 100-inch', 600000, 3000000, 'FREESTYLE100', 3),
      ('Kính thực tế ảo PICO 4', 'Kính thực tế ảo PICO 4', 400000, 2000000, 'PICO4', 5),
      ('Cảm biến Kinect V2 Cho Máy Tính', 'Cảm biến Kinect V2 Cho Máy Tính', 400000, 1000000, 'KINECTV2', 4),
      ('MacBook Air 13-inch i7 8GB 256GB', 'MacBook Air 13-inch i7 8GB 256GB', 1200000, 6000000, 'MBA13-I7-8GB', 3)
    ) as t(catalog_name, custom_name, price, deposit, code_prefix, n_instances)
  loop
    insert into public.equipment_types (name, product_type, tracking_type, price, deposit_amount, rental_period_unit, pricing_method)
    values (v_spec.catalog_name, 'rental', 'individual', v_spec.price, v_spec.deposit, 'day', 'flat_fee')
    returning id into v_type_id;

    v_inst_ids := '{}';
    for i in 1..v_spec.n_instances loop
      insert into public.equipment_instances (equipment_type_id, identifier_code, status)
      values (v_type_id, v_spec.code_prefix || '-' || lpad(i::text, 2, '0'), 'available')
      returning id into v_inst_id;
      v_inst_ids := array_append(v_inst_ids, v_inst_id);
    end loop;

    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = v_spec.custom_name and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_spec.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;

    v_cursor := 0;
    for v_order in
      select distinct order_id from public.order_equipment where custom_name = v_spec.custom_name order by order_id
    loop
      v_pos := 0;
      for v_line in
        select id from public.order_equipment
        where custom_name = v_spec.custom_name and order_id = v_order.order_id
        order by id
      loop
        update public.order_equipment
        set equipment_type_id = v_type_id,
            custom_name = null,
            equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % v_spec.n_instances) + 1]
        where id = v_line.id;
        v_pos := v_pos + 1;
      end loop;
      v_cursor := v_cursor + v_pos;
    end loop;
  end loop;
end $$;
