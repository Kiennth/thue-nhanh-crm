-- CEO 2026-08-04: "chuyển lịch sử thuê của [EOL] STARGO bên Booqable
-- sang cho Loa trợ giảng bên CRM mới, biến thể STARGO". Đối chiếu
-- Booqable API (2 đơn, 17 SL) khớp 100% với custom_name '[EOL] STARGO'.
-- Type "Loa trợ giảng" đích là bản serialize mới (theo từng sản phẩm)
-- CEO vừa tạo, có sẵn 2 biến thể (STARGO, TAKSTAR E300W) — gắn vào 1
-- serial mới thuộc đúng biến thể STARGO (equipment_instances.
-- equipment_unit_id).
do $$
declare
  v_type_id uuid;
  v_stargo_unit_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types
  where name = 'Loa trợ giảng' and tracking_type = 'individual';
  if v_type_id is null then
    return;
  end if;

  select id into v_stargo_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'STARGO';
  if v_stargo_unit_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[EOL] STARGO' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[EOL] STARGO', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, status)
  values (v_type_id, v_stargo_unit_id, 'LOATROGIANG-STARGO-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = '[EOL] STARGO';
end $$;
