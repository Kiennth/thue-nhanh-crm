-- CEO 2026-08-04: "sản phẩm EOL 02 mày chuyển qua CRM chưa?" — chưa,
-- gắn ngay. Đối chiếu Booqable API (2 đơn, 2 SL) khớp 100% với
-- custom_name 'EOL 02 - Space Gray, 128GB'. Lưu ý: cùng 2 đơn này còn
-- có dòng '[KHÔNG DÙNG]  - Space Gray, 128GB' trùng giá — đây là chuỗi
-- tên chung xuất hiện ở cả những đơn KHÔNG thuộc EOL 02 (kiểm tra thấy
-- 4 dòng tổng, chỉ 2 dòng trùng đơn EOL 02), nên cố tình KHÔNG gắn theo
-- EOL 02 để tránh nhầm — để riêng chờ xác định rõ nguồn gốc.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPad Pro M2 11 inch';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPADPROM211-03', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'EOL 02 - Space Gray, 128GB';
end $$;
