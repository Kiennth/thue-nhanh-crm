-- =============================================================================
-- Chuyển "Ổ cứng di động SSD 2TB" từ theo dõi số lượng sang theo từng sản
-- phẩm — theo quyết định người dùng: hàng đắt tiền/riêng biệt thì theo dõi
-- từng cái (biết đang ở đâu, trạng thái riêng), hàng rẻ/đại trà (cột chắn,
-- kệ TV...) vẫn giữ theo số lượng.
--
-- KHÔNG xoá equipment_units/equipment_stock cũ — lịch sử đơn hàng đã tham
-- chiếu equipment_unit_id này, xoá sẽ vi phạm khoá ngoại. Chỉ đưa số lượng
-- về 0 để không còn dùng cho đơn mới. Mã định danh là mã tạm theo chi nhánh
-- (SSD2TB-<chi nhánh>-NN) vì chưa có serial thật — sửa lại sau nếu cần, qua
-- nút Sửa từng sản phẩm ở trang Thiết bị.
-- =============================================================================

do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
  v_branch record;
  v_i int;
begin
  select id into v_type_id from public.equipment_types where name = 'Ổ cứng di động SSD 2TB';
  select id into v_unit_id from public.equipment_units
    where equipment_type_id = v_type_id and brand_model = 'Sandisk';

  if v_type_id is null or v_unit_id is null then
    raise exception 'Không tìm thấy sản phẩm "Ổ cứng di động SSD 2TB" / biến thể "Sandisk"';
  end if;

  -- Đổi tracking_type TRƯỚC khi tạo equipment_instances — trigger
  -- check_equipment_instance_tracking chỉ cho insert khi equipment_type đã
  -- là rental+individual.
  update public.equipment_types set tracking_type = 'individual' where id = v_type_id;

  for v_branch in
    select
      b.id,
      es.quantity_total,
      case b.name
        when 'Hà Nội' then 'HN'
        when 'Đà Nẵng' then 'DN'
        when 'TP HCM' then 'HCM'
        else upper(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g'))
      end as code
    from public.equipment_stock es
    join public.branches b on b.id = es.branch_id
    where es.equipment_unit_id = v_unit_id
  loop
    for v_i in 1..v_branch.quantity_total loop
      insert into public.equipment_instances (equipment_type_id, identifier_code, branch_id, status)
      values (v_type_id, 'SSD2TB-' || v_branch.code || '-' || lpad(v_i::text, 2, '0'), v_branch.id, 'available');
    end loop;
  end loop;

  update public.equipment_stock set quantity_total = 0, quantity_available = 0
    where equipment_unit_id = v_unit_id;
end $$;
