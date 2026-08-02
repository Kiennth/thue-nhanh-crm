-- CEO 2026-08-03: 3 đơn hàng cũ (BQ914, BQ327, BQ344) đã có sẵn trong CRM
-- từ đợt import Booqable trước đây, nhưng dòng thiết bị ứng với SKU
-- Booqable "EOL 03" (iPad Pro 11" M1 256GB Wi-Fi Only) không khớp được
-- sản phẩm nào trong danh mục lúc import nên bị lưu thành dòng tự do
-- (custom_name = 'EOL 03', không gắn equipment_type_id) — tra trực tiếp
-- qua API Booqable xác nhận đúng số tiền/ngày thuê đã khớp sẵn với đơn có
-- trong CRM. Gắn lại đúng 3 dòng này vào "iPad Pro M1 11-inch" (đã
-- serialize), phân đều qua 3 serial thật — không đụng các dòng tự do khác
-- trong cùng đơn (BQ914 còn 6 dòng khác không liên quan, giữ nguyên).
do $$
declare
  v_new_type_id uuid := 'b62ae8b5-5e8d-47be-86a4-bf5c9b9e058c';
begin
  update public.order_equipment
  set equipment_type_id = v_new_type_id,
      custom_name = null,
      equipment_instance_id = '55e871b3-dede-40a5-8d73-e26aa6d6802a'
  where id = 'c00f1d51-db09-4ea1-b315-bfb58d50ac9c'; -- BQ327

  update public.order_equipment
  set equipment_type_id = v_new_type_id,
      custom_name = null,
      equipment_instance_id = 'fd811d6d-0db0-4064-836a-889fa0667205'
  where id = 'eff70054-9445-4133-9bcc-5a5ace341ab0'; -- BQ344

  update public.order_equipment
  set equipment_type_id = v_new_type_id,
      custom_name = null,
      equipment_instance_id = '9e59b34c-3158-45e2-b5ba-f6877f28eeb3'
  where id = 'c7ca85da-5e2d-460e-85df-72fca621d040'; -- BQ914
end $$;
