-- CEO 2026-08-04: 2 yêu cầu liên tiếp về iPad.
--   1) "chuyển lịch sử thuê của iPad Mini 6 8.3 inch bên Booqable sang
--      cho iPad Mini 6 8.3 inch bên CRM mới" — dữ liệu đã có sẵn ở type
--      "iPad Mini 6 8.3-inch" (có gạch nối) từ trước, CEO vừa tạo type
--      mới không gạch nối "iPad Mini 6 8.3 inch" — dùng lại chính serial
--      cũ (IPADMINI6-01), chỉ đổi equipment_type_id, không tạo serial
--      mới trùng tên.
--   2) "chuyển lịch sử thuê của [NO TRACKING] iPad Pro M2 11-inch bên
--      Booqable sang cho iPad Pro M2 11 inch bên CRM mới" — đối chiếu
--      Booqable API (19 đơn, 19 SL) khớp 100% với custom_name
--      '[NO TRACKING] iPad Pro M2 11-inch - Wi-FI, 128GB'.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_old_unit_id uuid;
  v_inst_id uuid;
begin
  -- 1) iPad Mini 6
  select id into v_old_type_id from public.equipment_types where name = 'iPad Mini 6 8.3-inch';
  select id into v_new_type_id from public.equipment_types where name = 'iPad Mini 6 8.3 inch';
  if v_old_type_id is not null and v_new_type_id is not null then
    select id into v_old_unit_id from public.equipment_instances where equipment_type_id = v_old_type_id limit 1;
    if v_old_unit_id is not null then
      update public.equipment_instances set equipment_type_id = v_new_type_id where id = v_old_unit_id;
      update public.order_equipment
      set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_old_unit_id
      where equipment_type_id = v_old_type_id;
    end if;
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end if;

  -- 2) iPad Pro M2 11-inch
  select id into v_new_type_id from public.equipment_types where name = 'iPad Pro M2 11 inch';
  if v_new_type_id is not null then
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_new_type_id, 'IPADPROM211-02', 'available')
    returning id into v_inst_id;

    update public.order_equipment
    set equipment_type_id = v_new_type_id, custom_name = null, equipment_instance_id = v_inst_id
    where custom_name = '[NO TRACKING] iPad Pro M2 11-inch - Wi-FI, 128GB';
  end if;
end $$;
