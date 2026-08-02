-- CEO 2026-08-03: ngừng dùng "Màn Hình Tương Tác 27-inch GoWithMe" (theo
-- số lượng, 2 biến thể Xám/Trắng) — chuyển hẳn sang "Màn hình tương tác
-- GoWithMe 27-inch" (theo từng sản phẩm). Sản phẩm đích chưa có serial
-- thật — tạo serial tạm để gắn.
--
-- 42 dòng đơn hàng cũ (42 đơn — 1 đơn BQ12078 đang chuẩn bị). Nhiều dòng
-- quantity > 1 (tối đa 6) được tách thành nhiều dòng quantity = 1 trước
-- khi chuyển — giữ nguyên unit_price, tổng line_total không đổi.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 3.000.000đ, mới 1.000.000đ,
-- giảm) — CEO đã xác nhận chấp nhận đơn BQ12078 giảm cọc dự kiến theo
-- đúng catalog SKU mới.
do $$
declare
  v_old_type_id uuid := '511bc204-f457-4232-8649-137fc4b8a37a';
  v_new_type_id uuid := 'd733b936-48eb-4772-9aef-95ef2e5690dd';
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  for v_multi in
    select id, order_id, quantity, unit_price, equipment_unit_id
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_multi.equipment_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'GOWITHME27-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id in (
    select id from public.equipment_units where equipment_type_id = v_old_type_id
  );
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
