-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 15 Pro bên Booqable
-- sang cho iPhone 15 Pro bên CRM mới". Đối chiếu Booqable API (28 đơn,
-- 41 SL) khớp 100% với 2 biến thể custom_name 'iPhone 15 Pro - 128GB,
-- LL/A' + 'iPhone 15 Pro - 128GB, VN/A' bên CRM (34 dòng, 41 SL,
-- 89.980.000đ). 1 đơn đang mở (BQ6917) — đóng băng cọc dự kiến
-- 85.000.000đ trước khi gắn (cọc SKU này 5.000.000đ, nếu không đóng
-- băng đơn sẽ nhảy thêm 15.000.000đ cọc dự kiến).
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_order_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 15 Pro';
  if v_type_id is null then
    return;
  end if;

  select o.id into v_order_id from public.orders o where o.order_code = 'BQ6917';
  if v_order_id is not null then
    update public.orders set deposit_override_amount = 85000000
    where id = v_order_id and deposit_override_amount is null;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'IPHONE15PRO-01', 'available')
  returning id into v_inst_id;

  for v_multi in
    select id, order_id, quantity, unit_price, custom_name from public.order_equipment
    where custom_name in ('iPhone 15 Pro - 128GB, LL/A', 'iPhone 15 Pro - 128GB, VN/A')
      and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, v_multi.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name in ('iPhone 15 Pro - 128GB, LL/A', 'iPhone 15 Pro - 128GB, VN/A');
end $$;
