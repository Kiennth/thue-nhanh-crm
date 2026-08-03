-- CEO 2026-08-04: "chuyển lịch sử thuê của iPhone 12 Pro Max (SL) sang
-- iPhone 12 Pro Max để theo dõi theo serial". SKU cũ có 5 "biến thể"
-- theo màu trong danh mục (Bạc, Tím, Space Gray x2, Gold) nhưng KHÔNG
-- dòng order_equipment nào thực sự gán equipment_unit_id (toàn bộ 54
-- dòng đều null) — tức màu chỉ là danh mục biến thể chưa từng được gán
-- cho lịch sử thuê cụ thể nào. Không có gì để bảo toàn theo màu, nên
-- tạo 5 serial cùng tên (Bạc/Tím/Space Gray x2/Gold) và phân đều
-- round-robin cho 54 dòng.
--
-- Deposit đổi 5.000.000đ -> 2.000.000đ. 3 đơn đang mở: BQ6917 đã được
-- đóng băng cọc 85.000.000đ ở migration 20260804300000 (bỏ qua, không
-- ghi đè); 2 đơn còn lại (BQ...) đóng băng cọc hiện tại 5.000.000đ mỗi
-- đơn trước khi đổi.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit record;
  v_inst_id uuid;
  v_code text;
  v_used text[] := array[]::text[];
  v_multi record;
  i integer;
  v_lines record;
  v_insts uuid[];
  v_idx integer := 0;
begin
  select id into v_old_type_id from public.equipment_types where name = 'iPhone 12 Pro Max (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'iPhone 12 Pro Max';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  -- đóng băng cọc cho đơn đang mở, chỉ khi chưa có override
  update public.orders o
  set deposit_override_amount = (
    select round(
      coalesce(sum(coalesce(et.deposit_amount, 0) * l.quantity), 0)
      * coalesce((select c.deposit_percentage from public.customers c where c.id = o.customer_id), 100)
      / 100.0 / 1000000
    ) * 1000000
    from public.order_equipment l
    join public.equipment_types et on et.id = l.equipment_type_id
    where l.order_id = o.id and et.product_type = 'rental'
  )
  where o.id in (
    select distinct oe.order_id from public.order_equipment oe
    where oe.equipment_type_id = v_old_type_id
  ) and o.status <> 'nhap_kho_bao_tri' and o.deposit_override_amount is null;

  for v_unit in select brand_model from public.equipment_units where equipment_type_id = v_old_type_id order by brand_model loop
    v_code := 'IP12PM-' || upper(regexp_replace(v_unit.brand_model, '[^a-zA-Z0-9]', '', 'g'));
    if v_code = any(v_used) then
      v_code := v_code || '-2';
    end if;
    v_used := array_append(v_used, v_code);
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_insts := array_append(v_insts, v_inst_id);
  end loop;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  for v_lines in
    select id from public.order_equipment where equipment_type_id = v_old_type_id order by created_at, id
  loop
    update public.order_equipment
    set equipment_type_id = v_new_type_id, equipment_unit_id = null,
        equipment_instance_id = v_insts[(v_idx % array_length(v_insts, 1)) + 1]
    where id = v_lines.id;
    v_idx := v_idx + 1;
  end loop;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id in (select id from public.equipment_units where equipment_type_id = v_old_type_id);
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
