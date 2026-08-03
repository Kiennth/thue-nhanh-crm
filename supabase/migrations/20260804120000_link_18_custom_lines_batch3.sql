-- CEO 2026-08-04: rà soát đợt 2, gắn tiếp 18 tên tự do đã
-- được CEO xác nhận trực tiếp qua chat (bao gồm 2 mã Booqable nội bộ
-- "EOL 12" / "EOL 13" mà CEO xác định thủ công là iPad Air 4 / iPad Air
-- 5 M1 10.9-inch — không theo gợi ý thuật toán ban đầu).
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
    ('Máy quay Insta360 ONE X3', 'Insta360 ONE X3'),
    ('Thẻ game Super Mario Odyssey - NSW', 'Thẻ game Super Mario Party - NSW'),
    ('Mic không dây Rode Wireless GO II', 'Rode Wireless GO II'),
    ('Smart TV 4K 50-inch [TRACK ID] - SHARP', 'TV 4K 50-inch'),
    ('Máy tính bảng Prosper G11 10.1-inch', 'Prosper G11 10.1-inch'),
    ('Microphone Podcast Rode PodMic USB', 'Rode PodMic USB'),
    ('Tay cầm gắn micro MOVO', 'Tay cầm MOVO'),
    ('Smart TV 4K 55-inch - SAMSUNG QLED', 'TV 4k 55-inch'),
    ('Smart TV 75-inch 4K UHD [EOL] - COCOA', 'TV 4k 75-inch'),
    ('Smart TV 4K 50-inch [TRACK ID] - TCL QLED', 'TV 4K 50-inch'),
    ('Kính thông minh Meta RayBan (Gen 2) - ', 'Kính Meta Rayban 2'),
    ('EOL 12', 'iPad Air 4 10.9-inch'),
    ('Microsoft HoloLens 2', 'Kính VR Microsoft Hololens 2'),
    ('EOL 13', 'iPad Air 5 M1 10.9-inch'),
    ('Ghế công thái học Epione Easy Chair', 'Ghế công thái học - Đen'),
    ('Tay cầm chống rung Insta360 Flow - Creator Kit', 'Insta360 Flow - Creator Kit'),
    ('Máy tính bảng iPad Air 5 10.9-inch M1 Wi‑Fi Only', 'iPad Air 5 M1 10.9-inch'),
    ('Smart TV 75-inch 4K UHD [EOL] - THE-FRAME', 'TV 4k 75-inch')
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
end $$;
