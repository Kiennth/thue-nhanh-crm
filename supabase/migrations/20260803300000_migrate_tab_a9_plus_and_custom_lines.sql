-- CEO 2026-08-03: gộp cả 2 nguồn dữ liệu cũ của "Samsung Galaxy Tab A9+"
-- vào 1 sản phẩm serialize duy nhất — CEO xác nhận trực tiếp:
--   1) dòng tự do "Máy tính bảng Samsung Galaxy Tab A9+ - Wi-Fi + 5G"
--      (28 dòng, có dòng quantity > 1 phải tách trước)
--   2) mã "Máy tính bảng Samsung Galaxy Tab A9+ (SL)" (theo số lượng,
--      237 dòng — 3 đơn đang mở, cọc không đổi 500.000đ cả 2 mã)
-- Đích: "Máy tính bảng Samsung Galaxy Tab A9+" (theo từng sản phẩm) —
-- chưa có serial thật, tạo 1 serial tạm dùng chung cho cả 2 nguồn.
do $$
declare
  v_new_type_id uuid := '443a71fb-0ce9-425a-a16a-299899537bea';
  v_old_type_id uuid := 'e97184c4-5715-4038-851e-ec593cafd2d9';
  v_old_unit_id uuid := 'c8f8ad82-3b76-4bf4-b8bf-642dff869a13';
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'TABA9PLUS-01', 'available')
  returning id into v_inst_id;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = 'Máy tính bảng Samsung Galaxy Tab A9+ - Wi-Fi + 5G' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, 'Máy tính bảng Samsung Galaxy Tab A9+ - Wi-Fi + 5G', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;
  update public.order_equipment
  set equipment_type_id = v_new_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'Máy tính bảng Samsung Galaxy Tab A9+ - Wi-Fi + 5G';

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
