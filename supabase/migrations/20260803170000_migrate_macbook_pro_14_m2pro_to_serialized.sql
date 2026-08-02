-- CEO 2026-08-03: ngừng dùng "MacBook Pro 14 inch M2 PRO 16GB 512GB -
-- Space Gray" (theo số lượng) — chuyển hẳn sang "MacBook Pro 14-inch M2
-- Pro 16GB RAM" (theo từng sản phẩm). Sản phẩm đích chưa có serial thật —
-- tạo serial tạm để gắn.
--
-- 40 dòng đơn hàng cũ (40 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. LƯU Ý: deposit_amount 2 mã KHÁC NHAU
-- (cũ 20.000.000đ, mới 15.000.000đ, giảm) nhưng không ảnh hưởng thực tế
-- vì không đơn nào đang mở.
do $$
declare
  v_old_type_id uuid := '652ebdd8-2b1a-44a7-b1da-f7c78295e125';
  v_old_unit_id uuid := 'ec7059a4-04bb-4aa7-9e54-37c9e7d6e686';
  v_new_type_id uuid := 'd3c6d0cc-d29a-4ddd-9d9a-195e9ad6defc';
  v_inst_id uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MBPM2PRO14-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
