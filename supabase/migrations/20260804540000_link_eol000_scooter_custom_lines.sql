-- CEO 2026-08-04: "chuyển lịch sử thuê của EOL 000 bên Booqable sang
-- cho Xe Scooter Điện bên CRM mới". Đối chiếu Booqable API (33 đơn,
-- 60 SL) khớp 100% với custom_name 'EOL 000'. Type có 2 biến thể
-- (NINEBOT18W đã có 82 dòng cũ, S01 màu Trắng còn trống) — CEO xác
-- nhận gắn vào NINEBOT18W.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Xe Scooter Điện';
  if v_type_id is null then
    return;
  end if;

  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'NINEBOT18W';
  if v_unit_id is null then
    return;
  end if;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'EOL 000';
end $$;
