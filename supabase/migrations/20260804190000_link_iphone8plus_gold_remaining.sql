-- CEO 2026-08-04: "iPhone 8 Plus 64GB Gold cũng chính là iPhone 8
-- PLUS bên CRM mới" — CEO xác nhận 3 dòng còn sót ở BQ19/BQ641/BQ1120
-- (chưa rõ nguồn gốc Booqable cụ thể, cố tình bỏ qua ở migration
-- 20260804180000) cũng là cùng 1 sản phẩm, gộp nốt vào cùng serial.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'iPhone 8 PLUS';
  select id into v_inst_id from public.equipment_instances
  where equipment_type_id = v_type_id and status = 'available' limit 1;

  if v_type_id is null or v_inst_id is null then
    return;
  end if;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'iPhone 8 Plus 64GB Gold';
end $$;
