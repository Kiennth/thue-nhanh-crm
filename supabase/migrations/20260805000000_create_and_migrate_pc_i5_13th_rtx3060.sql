-- CEO 2026-08-04: "PC Core i5 13th | 32GB RAM | RTX 3060 bên Boo chuyển
-- qua bên CRM mới dùm ta, giữ nguyên tên, quản lý theo serial nhé" —
-- catalog CRM chưa có sản phẩm này, chỉ có 2 dòng order_equipment mồ côi
-- (1.080.000đ, cả 2 đơn đã đóng). Giá/cọc chốt với CEO: giống PC Core i5
-- 12th RTX 3060 (600k/ngày, cọc 5.000.000đ). Số lượng thật CEO chưa kiểm
-- kê xong, tạm dùng 10/10/10 theo Hà Nội/TP HCM/Đà Nẵng (CEO xác nhận
-- "cứ để con số nào cũng được, tao sẽ cho các kho kiểm tra và rà soát
-- lại" — số này CẦN RÀ SOÁT LẠI SAU, không phải tồn kho thật đã kiểm kê).
do $$
declare
  v_type_id uuid;
  v_branch_hn uuid := 'a877af86-9936-4dc2-b257-95bb49026cd0';
  v_branch_hcm uuid := '0f39724e-2017-491b-9246-79b64342ed74';
  v_branch_dn uuid := '60d43037-54e8-44e7-ba34-c139712b95b6';
  i integer;
  v_hn_ids uuid[] := '{}';
  v_inst_id uuid;
  v_line record;
  v_idx integer := 0;
begin
  insert into public.equipment_types (name, product_type, tracking_type, price, deposit_amount, rental_period_unit, pricing_method)
  values ('PC Core i5 13th | 32GB RAM | RTX 3060', 'rental', 'individual', 600000, 5000000, 'day', 'flat_fee')
  returning id into v_type_id;

  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_hn, 'PCI5-13TH-3060-HN-' || lpad(i::text, 2, '0'), 'available')
    returning id into v_inst_id;
    v_hn_ids := array_append(v_hn_ids, v_inst_id);
  end loop;
  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_hcm, 'PCI5-13TH-3060-HCM-' || lpad(i::text, 2, '0'), 'available');
  end loop;
  for i in 1..10 loop
    insert into public.equipment_instances (equipment_type_id, branch_id, identifier_code, status)
    values (v_type_id, v_branch_dn, 'PCI5-13TH-3060-DN-' || lpad(i::text, 2, '0'), 'available');
  end loop;

  -- cả 2 dòng lịch sử đều thuê tại Hà Nội (BQ11340, BQ11455)
  for v_line in
    select id from public.order_equipment
    where custom_name = 'PC Core i5 13th 32GB RAM RTX 3060'
    order by id
  loop
    update public.order_equipment
    set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_hn_ids[v_idx + 1]
    where id = v_line.id;
    v_idx := v_idx + 1;
  end loop;
end $$;
