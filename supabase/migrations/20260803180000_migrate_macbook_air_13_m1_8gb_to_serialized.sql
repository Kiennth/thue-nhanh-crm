-- CEO 2026-08-03: ngừng dùng "MacBook Air 13-inch M1 8GB RAM (SL)" (theo
-- số lượng) — chuyển hẳn sang "MacBook Air 13-inch M1 8GB RAM" (theo
-- từng sản phẩm). Sản phẩm đích chưa có serial thật — tạo serial tạm để
-- gắn.
--
-- 38 dòng đơn hàng cũ (25 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (5.000.000đ) nên không cần override cọc.
do $$
declare
  v_old_type_id uuid := 'f0b79cf2-2cfe-425a-9db0-a4b3468ac890';
  v_old_unit_id uuid := 'f164fa86-86e0-4105-9b76-e991bbd8b141';
  v_new_type_id uuid := '847eb5e1-642e-495c-aaa3-a493bea05e19';
  v_inst_id uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MBAM1-8GB-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
