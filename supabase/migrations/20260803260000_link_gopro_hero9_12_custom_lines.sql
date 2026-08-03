-- CEO 2026-08-03: CEO vừa tạo lại GoPro HERO9/10/11/12 Black trong danh
-- mục (trước đó chỉ có HERO13). Gắn toàn bộ dòng đơn hàng tự do liên quan
-- — cả nhóm đã đánh dấu "[KHÔNG DÙNG]" (Go9/10/11/12 BLK) lẫn nhóm tên
-- thường "GoPro HEROx Black" (thuộc nhóm "chưa có sản phẩm" trước đây, giờ
-- đã có SP nên gắn được) — vào đúng model, CEO xác nhận trực tiếp từng
-- cặp tên (kể cả sửa lại 1 chỗ gõ nhầm "HERO11 -> HERO10" thành đúng
-- "HERO11 -> HERO11").
--
-- Cả 4 model đều chưa có serial thật lúc gắn — mỗi model tạo 1 serial tạm,
-- dùng chung cho cả 2 nhóm tên (KHÔNG DÙNG + tên thường) của cùng model.
-- Dòng quantity > 1 được tách thành nhiều dòng quantity = 1 trước khi gắn.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
  v_names text[];
  v_name text;
begin
  -- GoPro HERO9 BLACK
  v_type_id := 'a29ea1db-2b1a-4175-add3-62a84fcc2eb4';
  v_names := array['Go9 BLK [KHÔNG DÙNG]', 'GoPro HERO9 Black'];
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'GOPROHERO9-01', 'available') returning id into v_inst_id;
  foreach v_name in array v_names loop
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = v_name and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
  end loop;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = any(v_names);

  -- GoPro HERO10 Black
  v_type_id := '25595f6a-4dc0-468c-bcc0-50763faeefce';
  v_names := array['GO10 BLK [KHÔNG DÙNG]', 'GoPro HERO10 Black'];
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'GOPROHERO10-01', 'available') returning id into v_inst_id;
  foreach v_name in array v_names loop
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = v_name and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
  end loop;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = any(v_names);

  -- GoPro HERO11 Black
  v_type_id := '561664c4-17e8-4d9e-bf63-3b197fd70b33';
  v_names := array['Go11 BLK [ KHÔNG DÙNG]', 'GoPro HERO11 Black'];
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'GOPROHERO11-01', 'available') returning id into v_inst_id;
  foreach v_name in array v_names loop
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = v_name and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
  end loop;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = any(v_names);

  -- GoPro HERO12 BLACK
  v_type_id := 'c8efe634-da5a-457b-a38b-ca2267979750';
  v_names := array['Go12 BLK [KHÔNG DÙNG] - Standard', 'GoPro HERO12 Black'];
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'GOPROHERO12-01', 'available') returning id into v_inst_id;
  foreach v_name in array v_names loop
    for v_multi in
      select id, order_id, quantity, unit_price from public.order_equipment
      where custom_name = v_name and quantity > 1
    loop
      update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
      for i in 2..v_multi.quantity loop
        insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
        values (v_multi.order_id, v_name, 1, v_multi.unit_price, v_multi.unit_price);
      end loop;
    end loop;
  end loop;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = any(v_names);

  -- GoPro Hero (đời gốc, không số) — CEO xác nhận trực tiếp
  v_type_id := 'b54c008c-3bc6-45a5-8149-eee77ada7f31';
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'GOPROHERO-01', 'available') returning id into v_inst_id;
  update public.order_equipment set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'Máy quay chống nước GoPro HERO';
end $$;
