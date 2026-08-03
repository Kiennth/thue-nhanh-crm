-- CEO 2026-08-03: ngừng dùng "GoPro HERO13 BLACK (SL)" (theo số lượng) —
-- chuyển hẳn sang "GoPro HERO13 BLACK" (theo từng sản phẩm). Sản phẩm
-- đích chưa có serial thật — tạo serial tạm để gắn.
--
-- 4 dòng đơn hàng cũ (1 đơn, đã nhập kho & bảo trì — không có đơn đang
-- mở), toàn bộ quantity = 1. LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ
-- 500.000đ, mới 5.000.000đ, tăng) nhưng không ảnh hưởng thực tế vì không
-- đơn nào đang mở.
do $$
declare
  v_old_type_id uuid := '71c7cc3d-eefa-4ccb-b6b2-49a0bc44100f';
  v_old_unit_id uuid := 'e2b27fa4-bc7b-4b89-9dc6-2f7e5e75ff2f';
  v_new_type_id uuid := '6c830284-542b-4a2b-93b7-f9b4672f062c';
  v_inst_id uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'GOPROHERO13-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
