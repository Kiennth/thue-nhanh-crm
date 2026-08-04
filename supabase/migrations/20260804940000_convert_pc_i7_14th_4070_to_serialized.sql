-- CEO 2026-08-04: "PC Core i7 14th 64GB RAM RTX 4070 12GB chuyển qua
-- serial" — CRM có 2 sản phẩm TRÙNG TÊN HOÀN TOÀN "PC Core i7 14th | 64GB
-- RAM | RTX 4070 12GB" (68d59ae2, cọc 20.000.000đ và 5f17729a, cọc
-- 10.000.000đ) — hỏi lại CEO, chốt chuyển đúng cái cọc 20.000.000đ
-- (68d59ae2), không đụng vào cái còn lại (nghi trùng lặp catalog, CEO tự
-- xử lý sau nếu cần).
--
-- 2 dòng order_equipment đã gắn sẵn (toàn quantity=1), 1.200.000đ, 0 đơn
-- đang mở. equipment_stock thật: 10/10/10 theo Hà Nội/TP HCM/Đà Nẵng —
-- tạo instance đúng theo tồn kho thật.
do $$
declare
  v_type_id uuid := '68d59ae2-038a-4926-8e61-c70f8833454c';
  v_unit_id uuid;
  v_branch_hn uuid := 'a877af86-9936-4dc2-b257-95bb49026cd0';
  v_branch_hcm uuid := '0f39724e-2017-491b-9246-79b64342ed74';
  v_branch_dn uuid := '60d43037-54e8-44e7-ba34-c139712b95b6';
  i integer;
  v_hn_ids uuid[] := '{}';
  v_hcm_ids uuid[] := '{}';
  v_dn_ids uuid[] := '{}';
  v_inst_id uuid;
  v_order record;
  v_line record;
  v_pool uuid[];
  v_cursor_hn integer := 0;
  v_cursor_hcm integer := 0;
  v_cursor_dn integer := 0;
  v_pos integer;
begin
  if not exists (select 1 from public.equipment_types where id = v_type_id) then
    return;
  end if;
  select id into v_unit_id from public.equipment_units where equipment_type_id = v_type_id limit 1;

  update public.equipment_types set tracking_type = 'individual' where id = v_type_id;

  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_hn, 'PCI7-14TH-4070-HN-' || lpad(i::text, 2, '0'), 'available')
    returning id into v_inst_id;
    v_hn_ids := array_append(v_hn_ids, v_inst_id);
  end loop;
  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_hcm, 'PCI7-14TH-4070-HCM-' || lpad(i::text, 2, '0'), 'available')
    returning id into v_inst_id;
    v_hcm_ids := array_append(v_hcm_ids, v_inst_id);
  end loop;
  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_dn, 'PCI7-14TH-4070-DN-' || lpad(i::text, 2, '0'), 'available')
    returning id into v_inst_id;
    v_dn_ids := array_append(v_dn_ids, v_inst_id);
  end loop;

  for v_order in
    select o.id as order_id, o.pickup_branch_id
    from public.orders o
    where o.id in (select distinct order_id from public.order_equipment where equipment_type_id = v_type_id)
  loop
    if v_order.pickup_branch_id = v_branch_hn then
      v_pool := v_hn_ids;
    elsif v_order.pickup_branch_id = v_branch_hcm then
      v_pool := v_hcm_ids;
    else
      v_pool := v_dn_ids;
    end if;

    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where equipment_type_id = v_type_id and order_id = v_order.order_id
      order by id
    loop
      if v_order.pickup_branch_id = v_branch_hn then
        update public.order_equipment set equipment_unit_id = null, equipment_instance_id = v_pool[((v_cursor_hn + v_pos) % array_length(v_pool, 1)) + 1] where id = v_line.id;
      elsif v_order.pickup_branch_id = v_branch_hcm then
        update public.order_equipment set equipment_unit_id = null, equipment_instance_id = v_pool[((v_cursor_hcm + v_pos) % array_length(v_pool, 1)) + 1] where id = v_line.id;
      else
        update public.order_equipment set equipment_unit_id = null, equipment_instance_id = v_pool[((v_cursor_dn + v_pos) % array_length(v_pool, 1)) + 1] where id = v_line.id;
      end if;
      v_pos := v_pos + 1;
    end loop;

    if v_order.pickup_branch_id = v_branch_hn then
      v_cursor_hn := v_cursor_hn + v_pos;
    elsif v_order.pickup_branch_id = v_branch_hcm then
      v_cursor_hcm := v_cursor_hcm + v_pos;
    else
      v_cursor_dn := v_cursor_dn + v_pos;
    end if;
  end loop;

  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where id = v_unit_id;
end $$;
