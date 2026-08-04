-- CEO 2026-08-04: "EOL - WF chính là Cục phát 4G bên CRM mới" +
-- "chuyển lịch sử thuê của Cục phát 4G bên Booqable sang cho Cục phát
-- 4G bên CRM mới" — 2 SKU Booqable khác nhau cùng gộp về 1 sản phẩm:
--   'EOL - WF' (10 đơn, 22 SL)
--   'Cục phát 4G' (70 đơn, 89 SL, khớp thẳng theo custom_name đúng tên)
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Cục phát 4G';
  if v_type_id is null then
    return;
  end if;

  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;
  if v_unit_id is null then
    insert into public.equipment_units (equipment_type_id, brand_model)
    values (v_type_id, 'Cục phát 4G')
    returning id into v_unit_id;
  end if;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name in ('EOL - WF', 'Cục phát 4G');
end $$;
