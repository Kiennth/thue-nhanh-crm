-- CEO 2026-08-03: ngừng dùng "MacBook Air M1 16GB RAM 13-inch" (theo số
-- lượng) — chuyển hẳn sang "MacBook Air 13-inch M1 16GB RAM" (theo từng
-- sản phẩm). Sản phẩm đích chưa có serial thật — tạo serial tạm để gắn.
--
-- 22 dòng đơn hàng cũ (20 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (5.000.000đ) nên không cần override cọc.
do $$
declare
  v_old_type_id uuid := '047175b2-438f-4c42-b2c7-70ab9fc4a4fe';
  v_old_unit_id uuid := 'd4a72d40-2c8d-41a9-a4fc-cb8f36d5c3e8';
  v_new_type_id uuid := '8329312f-2586-42cc-b52f-47dc9e15f757';
  v_inst_id uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MBAM1-16GB-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
