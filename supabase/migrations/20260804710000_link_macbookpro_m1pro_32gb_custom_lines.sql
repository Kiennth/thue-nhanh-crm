-- CEO 2026-08-04: "MacBook Pro M1 PRO 32GB 512GB 16-inch chính là
-- MacBook Pro 16 inch M1 Pro 32GB RAM bên CRM mới". Type đích không
-- phân biệt dung lượng nên gộp luôn cả biến thể 1TB cùng RAM (không
-- có type khác phù hợp hơn) — 2 serial riêng theo dung lượng
-- (512GB: 47 dòng, 1TB: 23 dòng, tổng 322.130.000đ). 0 đơn đang mở.
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'MacBook Pro 16 inch M1 Pro 32GB RAM';
  if v_type_id is null then
    return;
  end if;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'MBP16M1PRO32-512-01', 'available')
  returning id into v_inst_id;
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'MacBook Pro M1 PRO 32GB 512GB 16-inch';

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_type_id, 'MBP16M1PRO32-1TB-01', 'available')
  returning id into v_inst_id;
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = 'MacBook Pro M1 PRO 32GB RAM 1TB 16-inch';
end $$;
