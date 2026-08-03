-- CEO 2026-08-03: gắn tiếp 74 tên tự do vào đúng sản phẩm trong
-- danh mục — so khớp bắt buộc đúng thông số kỹ thuật (chip/Pro-Max/RAM/
-- dung lượng/kích thước) trước khi gắn, tránh lặp lại lỗi gộp nhầm M3
-- Pro/Max đã gặp ở lần rà soát trước. CEO xác nhận trực tiếp từng cặp
-- qua chat (một số cặp CEO tự phát hiện thêm ngoài danh sách gợi ý, ví
-- dụ các biến thể "Smart TV 4K 50-inch" theo nhiều hãng khác nhau đều
-- gộp về đúng 1 sản phẩm "TV 4K 50-inch").
--
-- Với sản phẩm "theo số lượng": chỉ cần gắn equipment_unit_id (tạo biến
-- thể mặc định nếu type chưa có). Với sản phẩm "theo từng sản phẩm": tách
-- các dòng quantity > 1 thành nhiều dòng quantity = 1 trước, rồi phân đều
-- qua serial thật sẵn có (hoặc tạo 1 serial tạm nếu type chưa có serial
-- nào) — giữ nguyên unit_price, tổng line_total không đổi.
do $$
declare
  v_pair record;
  v_type record;
  v_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
  v_lines_left integer;
begin
  for v_pair in
    select * from (values
    ('Smart TV 1080p 43-inch - Sharp', 'Smart TV 1080p 43-inch'),
    ('laptop MSI Katana i7 13620H | 32GB DDR5 | 512GB SSD | RTX 4050 6GB | 144Hz', 'MSI Katana i7 13620H | 32GB DDR5 | 512GB SSD | RTX 4050 6GB IPS 144Hz'),
    ('Smart TV 4K 50-inch [TRACK ID] - Samsung', 'TV 4K 50-inch'),
    ('iPad Pro M1 12.9 inch - Wi-Fi + 5G', 'iPad Pro M1 12.9-inch'),
    ('iPhone 11 Pro Max - Gold', 'iPhone 11 Pro Max'),
    ('Xe Điện Cân Bằng Xiaomi Ninebot Mini', 'Xe điện cân bằng Ninebot Mini'),
    ('Loa thông minh HomePod Mini - Black', 'Loa thông minh HomePod Mini'),
    ('iPad Pro 12.9-inch M2 - Wi-Fi', 'iPad Pro M2 12.9-inch'),
    ('Máy tính bảng Samsung Galaxy Tab A9 - Wi-Fi + LTE', 'Máy tính bảng Samsung Galaxy Tab A9+'),
    ('iMac 24-inch 4.5K M1 Chip 16GB RAM', 'iMac M1 4.5K 24-inch 16GB RAM'),
    ('Smart TV 4K 43-inch - SAMSUNG', 'TV 4k 43-inch'),
    ('iPhone 11 Pro Max - Green', 'iPhone 11 Pro Max'),
    ('Điện thoại iPhone 14 Pro Max', 'iPhone 14 Pro Max'),
    ('Smart TV 4K 50-inch - Toshiba', 'TV 4K 50-inch'),
    ('Màn Hình 1080P 24-inch - Samsung LS24F320GAEXXV', 'Màn Hình 1080P 24-inch'),
    ('Laptop MSI Katana i7 13620H | 32GB DDR5 | 512GB SSD | RTX 4050 6GB | 144Hz', 'MSI Katana i7 13620H | 32GB DDR5 | 512GB SSD | RTX 4050 6GB IPS 144Hz'),
    ('iPhone 15 Pro Max - Black', 'iPhone 15 Pro Max'),
    ('Ổ cứng di động SSD 1TB - Samsung T7 Shield', 'Ổ cứng di động SSD 1TB'),
    ('{EOL] Loa di động Marshall Kilburn 2  - Brass', 'Loa di động Marshall Kilburn 2'),
    ('DJI MIC ', 'DJI Mic lavalier'),
    ('Máy tính bảng Samsung Galaxy Tab S9 FE - Wi-Fi + 5G', 'Máy tính bảng Samsung Galaxy Tab S9 FE'),
    ('Máy tính bảng Lenovo Tab Pro 12.7-inch', 'Lenovo Tab Pro 12.7-inch'),
    ('Smart TV 4K 98-inch - SAMSUNG', 'TV 4k 98-inch'),
    ('Smart TV 4K 75-inch  - TCL', 'TV 4k 75-inch'),
    ('Smart TV 4K 50-inch [TRACK ID] - AQUA', 'TV 4K 50-inch'),
    ('iPad Pro M4  11-inch - Wi-Fi', 'iPad Pro M4 11-inch'),
    ('Loa để bàn Marshall Stanmore 2 - Black', 'Loa để bàn Marshall Stanmore 2'),
    (' iPad Pro M5 13 inch - Wi-Fi Only', 'iPad Pro M5 13-inch'),
    ('Xe điện cân bằng Ninebot Mini - Black', 'Xe điện cân bằng Ninebot Mini'),
    ('Smart TV 4K 50-inch [TRACK ID] - XIAOMI', 'TV 4K 50-inch'),
    ('Loa trợ giảng  - STARGO', 'Loa trợ giảng'),
    ('Nintendo Switch Lite', 'Nintendo Switch'),
    ('Smart TV 65-inch 4K - Hisense_65A6500K', 'Smart TV 65-inch 4K'),
    ('Smart TV 4K 50-inch - Coca', 'TV 4K 50-inch'),
    ('Loa Karaoke Di Động Divoom SongBird HQ - MINT', 'Loa di động Divoom SongBird HQ'),
    ('Microphone RODE NT1 5TH GEN', 'RODE NT1 5TH GEN'),
    ('Smart TV 4K 50-inch - Sharp', 'TV 4K 50-inch'),
    ('iPad Pro M1 11-inch  - Wi-Fi + 5G', 'iPad Pro M1 11-inch'),
    ('Màn hình tương tác 22-inch GoWithMe - Trắng', 'Màn hình tương tác GoWithMe 22-inch'),
    ('Loa Karaoke Di Động Divoom SongBird HQ - CREAM', 'Loa di động Divoom SongBird HQ'),
    ('Loa Kiểm Âm Ortizan C7 (cặp) - Black', 'Loa Kiểm Âm Ortizan C7 (cặp)'),
    ('Smart TV 4K 43-inch - XIAOMI', 'TV 4k 43-inch'),
    ('iPhone 12 Series - iPhone 12', 'iPhone 12'),
    ('Cột Chắn INOX gắn bảng thông báo chỉ dẫn A4 (3m) - Bảng Ngang', 'Cột Chắn INOX gắn bảng thông báo chỉ dẫn A4 (3m)'),
    ('Dây HDMI to HDMI 10m', 'dây HDMI to HDMI 4K - 10m'),
    ('Màn Hình Tương Tác 27-inch GoWithMe - Màu Trắng', 'Màn hình tương tác GoWithMe 27-inch'),
    ('Tay cầm Microsoft Xbox Wireless Controller', 'Microsoft Xbox Wireless Controller'),
    ('Smart TV 1080p 32-inch - COCA 32S3U', 'Smart TV 1080p 32-inch'),
    ('Insta360 GO Action Camera', 'Insta360 GO 3 Action Camera'),
    ('Giá đỡ máy tính bảng chân đứng chống trộm 7 inch tới 13 inch - Trắng', 'Giá đỡ máy tính bảng chân đứng chống trộm 7 inch tới 13 inch'),
    ('Smart TV 4K 50-inch [TRACK ID] - TOSHIBA', 'TV 4K 50-inch'),
    ('Smart TV 4K 50-inch - Samsung', 'TV 4K 50-inch'),
    ('Adapter USB-C to HDMI', 'USB-C to HDMI Multiport Adapter'),
    ('Cây giá đỡ ipad', 'Giá đỡ iPad'),
    ('Dock Nintendo Switch', 'Nintendo Switch'),
    ('bát treo TV lên tường', 'Bát treo tường TV'),
    ('Nintendo Switch Dock', 'Nintendo Switch'),
    ('Combo chuột + phím có dây màu đen', 'Combo chuột phím có dây'),
    ('Smart TV 65-inch 4K - TCL 65P755Pro', 'Smart TV 65-inch 4K'),
    ('Tai nghe Silent Headphones - Transmitter Hi-Fi', 'Tai nghe Silent Headphones - Tai nghe Hi-Fi'),
    ('Bát TV gắn tường treo dọc', 'Bát treo tường TV'),
    ('Chuột phím có dây', 'Combo chuột phím có dây'),
    ('Bát treo TV gắn tường', 'Bát treo tường TV'),
    ('dây XLR 5m', 'Dây Cáp XLR - XLR - 5m'),
    ('Apple TV - 4K 2022', 'Apple TV 4K'),
    ('MacBook Pro M3 PRO 18GB RAM - 14-inch', 'MacBook Pro 14-inch M3 Pro 18GB RAM'),
    ('[KHÔNG DÙNG] MacBook Pro 16 inch M3 PRO 36GB RAM  - Space Black', 'MacBook Pro 16-inch M3 Pro 36GB RAM'),
    ('Màn hình tương tác 22-inch GoWithMe - Đen', 'Màn hình tương tác GoWithMe 22-inch'),
    ('iPad Pro M4 13 inch - Wi-Fi + 5G', 'iPad Pro M4 13-inch'),
    ('DJI Osmo Action 5 Pro - Adventure Combo', 'DJI Osmo Action 5 Pro'),
    ('MacBook Pro M3 PRO 36GB RAM - 14-inch', 'MacBook Pro 14-inch M3 Pro 36GB RAM'),
    ('Smart TV 4K 55-inch - TCL', 'TV 4k 55-inch'),
    ('MacBook Pro M3 MAX 48GB RAM - 16-inch', 'MacBook Pro 16-inch M3 Max 48GB RAM'),
    ('Smart TV 4K 50-inch [TRACK ID] - SHARP', 'TV 4K 50-inch')
    ) as t(old_name, new_name)
  loop
    select id, tracking_type into v_type
    from public.equipment_types
    where lower(name) = lower(v_pair.new_name)
    limit 1;

    if v_type.id is null then
      raise notice 'BỎ QUA (không tìm thấy sản phẩm đích): % -> %', v_pair.old_name, v_pair.new_name;
      continue;
    end if;

    select count(*) into v_lines_left from public.order_equipment where custom_name = v_pair.old_name;
    if v_lines_left = 0 then
      continue;
    end if;

    if v_type.tracking_type = 'quantity' then
      select id into v_unit_id from public.equipment_units where equipment_type_id = v_type.id limit 1;
      if v_unit_id is null then
        insert into public.equipment_units (equipment_type_id, brand_model)
        values (v_type.id, v_pair.new_name)
        returning id into v_unit_id;
      end if;
      update public.order_equipment
      set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = v_unit_id
      where custom_name = v_pair.old_name;
    else
      for v_multi in
        select id, order_id, quantity, unit_price from public.order_equipment
        where custom_name = v_pair.old_name and quantity > 1
      loop
        update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
        for i in 2..v_multi.quantity loop
          insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
          values (v_multi.order_id, v_pair.old_name, 1, v_multi.unit_price, v_multi.unit_price);
        end loop;
      end loop;

      select id into v_inst_id from public.equipment_instances
      where equipment_type_id = v_type.id and status = 'available' limit 1;
      if v_inst_id is null then
        insert into public.equipment_instances (equipment_type_id, identifier_code, status)
        values (v_type.id, upper(left(regexp_replace(v_pair.new_name, '[^a-zA-Z0-9]', '', 'g'), 14)) || '-01', 'available')
        returning id into v_inst_id;
      end if;

      with lines as (
        select id, row_number() over (order by created_at, id) - 1 as rn
        from public.order_equipment where custom_name = v_pair.old_name
      ),
      instances as (
        select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
        from public.equipment_instances where equipment_type_id = v_type.id and status = 'available'
      )
      update public.order_equipment oe
      set equipment_type_id = v_type.id, custom_name = null, equipment_unit_id = null, equipment_instance_id = ins.id
      from lines l join instances ins on ins.rn = l.rn % ins.total
      where oe.id = l.id;
    end if;
  end loop;

  -- Smart TV 4K 50-inch - Casper (theo số lượng) -> TV 4K 50-inch (theo từng sản phẩm)
  perform 1;
end $$;
