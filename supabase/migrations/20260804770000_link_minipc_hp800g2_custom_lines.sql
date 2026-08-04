-- CEO 2026-08-04: "Máy miniPC HP 800 G2 i5 6500T 8G 256GB chính là Mini PC
-- i5 Gen 6 8GB RAM 256GB SSD" — 15 dòng order_equipment mồ côi
-- (90.450.000đ, 0 đơn đang mở, không cần đóng băng cọc). Type này là
-- quantity-tracked (không phải serialized) nên không cần tách dòng
-- quantity>1 — chỉ gắn equipment_unit_id vào unit mặc định có sẵn.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Mini PC i5 Gen 6 8GB RAM 256GB SSD';
  if v_type_id is null then
    return;
  end if;
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Máy miniPC HP 800 G2 i5 6500T 8G 256GB';
end $$;
