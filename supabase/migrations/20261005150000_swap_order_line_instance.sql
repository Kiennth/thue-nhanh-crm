-- Đổi serial trên dòng đơn kiểu Booqable (CEO 2026-10-05): chỉ thay máy của
-- dòng — giữ nguyên dòng, số lượng, đơn giá, thành tiền. Chạy được cả khi máy
-- đang ở chỗ khách (đơn đã giao, chưa nhập kho): máy cũ về "Sẵn có", máy mới
-- sang "Đang cho thuê" trong cùng 1 transaction. Đơn đã nhập kho/hoàn tất chỉ
-- sửa nhãn (chỉnh dữ liệu lịch sử), không đụng kho.
-- security definer vì nhân viên thường không có quyền update equipment_instances
-- (RLS chỉ admin/kế toán) — kiểm tra quyền/điều kiện nằm ngay trong hàm.
create or replace function public.swap_order_line_instance(p_line_id uuid, p_instance_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_order record;
  v_new record;
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;

  select id, order_id, equipment_type_id, equipment_instance_id
  into v_line
  from public.order_equipment
  where id = p_line_id
  for update;

  if v_line.id is null or v_line.equipment_instance_id is null then
    raise exception 'Dòng này không phải máy serial';
  end if;
  if v_line.equipment_instance_id = p_instance_id then
    return;
  end if;

  select id, cancelled_at, delivery_stock_moved_at, return_stock_transferred_at
  into v_order
  from public.orders
  where id = v_line.order_id
  for update;

  if v_order.cancelled_at is not null then
    raise exception 'Đơn đã huỷ';
  end if;

  select id, equipment_type_id, identifier_code, status
  into v_new
  from public.equipment_instances
  where id = p_instance_id
  for update;

  if v_new.id is null or v_new.equipment_type_id <> v_line.equipment_type_id then
    raise exception 'Máy mới phải cùng sản phẩm với máy cũ';
  end if;
  if v_new.status = 'disposed' then
    raise exception 'Máy % đã thanh lý', v_new.identifier_code;
  end if;

  if v_order.delivery_stock_moved_at is not null and v_order.return_stock_transferred_at is null then
    if v_new.status <> 'available' then
      raise exception 'Máy % không có sẵn trong kho', v_new.identifier_code;
    end if;
    update public.equipment_instances
      set status = 'available'
      where id = v_line.equipment_instance_id and status = 'rented';
    update public.equipment_instances
      set status = 'rented'
      where id = p_instance_id;
  end if;

  update public.order_equipment
    set equipment_instance_id = p_instance_id
    where id = p_line_id;
end;
$$;

grant execute on function public.swap_order_line_instance(uuid, uuid) to authenticated;
