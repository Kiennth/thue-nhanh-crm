-- CEO 2026-08-03: ngừng dùng "MacBook Pro 13.3 inch M1  16GB RAM - 512GB"
-- (theo số lượng) — chuyển hẳn sang "MacBook Pro 13.3-inch M1 16GB RAM"
-- (theo từng sản phẩm). Sản phẩm đích chưa có serial thật — tạo serial
-- tạm (mã đánh dấu rõ là tạm), giống pattern các migration trước.
--
-- 16 dòng đơn hàng cũ (16 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (5.000.000đ) nên không cần override cọc.
do $$
declare
  v_old_type_id uuid := '782bfc30-6e5e-4d30-9e90-b5547bce9e54';
  v_old_unit_id uuid := '5f03d9c0-0d38-458f-992b-96122098109f';
  v_new_type_id uuid := '4c0b60fc-e9a3-4c14-a8e2-6ce04cef5bb1';
  v_inst_id uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MBPM1133-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
