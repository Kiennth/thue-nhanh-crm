-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 15 Pro Max (SL) sang
-- iPhone 15 Pro Max bên CRM mới" — cả 2 SKU đều "theo số lượng" (không
-- serialize), chỉ gộp về đúng 1 unit. Deposit đổi 0đ -> 5.000.000đ
-- nhưng 0 đơn đang mở nên an toàn.
--
-- Lưu ý: 2 dòng cũ có sẵn equipment_instance_id (dữ liệu tồn dư từ
-- trước, dù type là "theo số lượng" không hợp lệ theo trigger hiện tại)
-- — phải set về null tường minh khi relink, nếu không trigger
-- check_order_equipment_line() báo lỗi "Hàng cho thuê theo số lượng
-- không dùng sản phẩm riêng lẻ".
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_old_unit_id uuid;
  v_new_unit_id uuid;
begin
  select id into v_old_type_id from public.equipment_types where name = 'iPhone 15 Pro Max (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'iPhone 15 Pro Max';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  select id into v_old_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (v_new_type_id, 'iPhone 15 Pro Max')
  returning id into v_new_unit_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = v_new_unit_id, equipment_instance_id = null
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
