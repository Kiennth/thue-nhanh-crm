-- CEO 2026-08-04: "Điện thoại Xiaomi K30 5G chính là Điện thoại Xiaomi K30
-- 5G trên CRM mới" — 26 dòng order_equipment mồ côi "Điện thoại Xiaomi -
-- K30 5G 8GB 128GB" (125.800.740đ, 0 đơn đang mở). Phát hiện: gần hết 26
-- dòng có quantity lớn (có đơn tới 24, 18, 17 máy cùng lúc — rõ ràng thuê
-- theo lô sự kiện, không phải máy có serial riêng), trong khi sản phẩm
-- catalog "Điện thoại Xiaomi K30 5G" đang cấu hình individual (serial hoá)
-- — hỏi lại CEO, chốt: đổi type này sang quantity-tracked (khớp đúng cách
-- thực tế đang thuê) thay vì tạo hàng chục instance giả. Type này chưa
-- từng dùng trong đơn nào (0 dòng đã gắn, 0 unit/instance có sẵn) nên đổi
-- tracking_type an toàn, không ảnh hưởng dữ liệu khác.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Điện thoại Xiaomi K30 5G';
  if v_type_id is null then
    return;
  end if;

  update public.equipment_types set tracking_type = 'quantity' where id = v_type_id;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (v_type_id, 'Điện thoại Xiaomi K30 5G')
  returning id into v_unit_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Điện thoại Xiaomi - K30 5G 8GB 128GB';
end $$;
