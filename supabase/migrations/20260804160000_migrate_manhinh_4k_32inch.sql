-- CEO 2026-08-04: "chuyển hết lịch sử thuê của Màn Hình 4K IPS 32-inch -
-- Samsung M7 sang Màn hình 4K 32-inch". Deposit đổi từ 2.000.000đ (SKU
-- cũ, theo số lượng) xuống 1.000.000đ (SKU mới, theo từng sản phẩm), có
-- 1 đơn đang mở (đơn có cả Laptop ACER + Laptop MSI Modern, tổng cọc
-- tính được 12.000.000đ ở thời điểm chuyển) — CEO chỉ đạo: từ nay các
-- lần chuyển SKU đổi cọc cứ tự động giữ nguyên cọc dự kiến cho đơn đang
-- mở, không cần hỏi lại nữa. Dùng deposit_override_amount (mới thêm ở
-- migration 20260802060000) để đóng băng đúng số 12.000.000đ trước khi
-- đổi loại sản phẩm.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_inst_id uuid;
  v_order record;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types where name = 'Màn Hình 4K IPS 32-inch - Samsung M7';
  select id into v_new_type_id from public.equipment_types where name = 'Màn hình 4K 32-inch';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  -- đóng băng cọc cho các đơn đang mở đang dùng SKU cũ, trước khi đổi
  for v_order in
    select distinct o.id, o.customer_id
    from public.orders o
    join public.order_equipment oe on oe.order_id = o.id
    where oe.equipment_type_id = v_old_type_id and o.status <> 'nhap_kho_bao_tri'
      and o.deposit_override_amount is null
  loop
    update public.orders o
    set deposit_override_amount = (
      select round(
        coalesce(sum(coalesce(et.deposit_amount, 0) * l.quantity), 0)
        * coalesce((select c.deposit_percentage from public.customers c where c.id = v_order.customer_id), 100)
        / 100.0 / 1000000
      ) * 1000000
      from public.order_equipment l
      join public.equipment_types et on et.id = l.equipment_type_id
      where l.order_id = v_order.id and et.product_type = 'rental'
    )
    where o.id = v_order.id;
  end loop;

  select id into v_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, v_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'MANHINH4K32-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
