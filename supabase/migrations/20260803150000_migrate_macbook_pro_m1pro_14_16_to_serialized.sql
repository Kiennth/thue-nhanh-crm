-- CEO 2026-08-03: ngừng dùng 2 mã "MacBook Pro M1 PRO 16GB 512GB 14-inch"
-- và "MacBook Pro M1 PRO 16GB 512GB 16-inch" (theo số lượng) — chuyển hẳn
-- sang "MacBook Pro 14-inch M1 Pro 16GB RAM" / "MacBook Pro 16-inch M1
-- Pro 16GB RAM" (theo từng sản phẩm). Cả 2 sản phẩm đích chưa có serial
-- thật nào trong danh mục — tạo serial tạm (mã rõ ràng đánh dấu tạm),
-- giống cách đã làm ở migration 20260803140000.
--
-- 14-inch: 79 dòng (79 đơn — 3 đơn đang mở đang vận hành/xử lý sự cố:
-- BQ11992, BQ12164, BQ2540), toàn bộ quantity = 1. deposit_amount 2 mã
-- GIỐNG NHAU (10.000.000đ) nên không cần override cọc.
--
-- 16-inch: 36 dòng (35 đơn — 1 đơn BQ12054 đang chuẩn bị), toàn bộ
-- quantity = 1. LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 5.000.000đ, mới
-- 10.000.000đ) — CEO đã xác nhận chấp nhận đơn BQ12054 tăng cọc dự kiến
-- theo đúng catalog SKU mới.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_14_old uuid := '1c84c341-ec50-4c2b-ad98-521ca4a3aec0';
  v_14_old_unit uuid := 'e04c79e4-aef7-4136-bd33-9025cb1c6ca8';
  v_14_new uuid := '059d04ff-b564-435e-8d88-f3ec959d561c';
  v_16_old uuid := 'e676e154-01d0-4abd-bbdd-195b01a6e5ae';
  v_16_old_unit uuid := '6d283e22-d789-48a6-b45b-6c7d30e18880';
  v_16_new uuid := '6d6bf534-e011-49de-9016-2f041a650e35';
  v_14_inst uuid;
  v_16_inst uuid;
begin
  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_14_new, 'MBPM1PRO14-01', 'available')
  returning id into v_14_inst;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_16_new, 'MBPM1PRO16-01', 'available')
  returning id into v_16_inst;

  update public.order_equipment
  set equipment_type_id = v_14_new, equipment_unit_id = null, equipment_instance_id = v_14_inst
  where equipment_type_id = v_14_old;

  update public.order_equipment
  set equipment_type_id = v_16_new, equipment_unit_id = null, equipment_instance_id = v_16_inst
  where equipment_type_id = v_16_old;

  delete from public.equipment_instances where equipment_type_id = v_14_old;
  delete from public.equipment_stock where equipment_unit_id = v_14_old_unit;
  delete from public.equipment_units where equipment_type_id = v_14_old;
  delete from public.equipment_types where id = v_14_old;

  delete from public.equipment_instances where equipment_type_id = v_16_old;
  delete from public.equipment_stock where equipment_unit_id = v_16_old_unit;
  delete from public.equipment_units where equipment_type_id = v_16_old;
  delete from public.equipment_types where id = v_16_old;
end $$;
