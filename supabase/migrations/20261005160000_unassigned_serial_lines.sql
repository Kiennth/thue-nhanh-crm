-- Lên đơn hàng serial KHÔNG gán máy ngay (học Booqable, CEO 2026-10-05):
-- dòng hàng theo dõi riêng lẻ được để trống equipment_instance_id ("chưa gán
-- serial") — mỗi dòng vẫn là 1 máy (quantity = 1), giữ đơn giá riêng. Gán
-- serial sau (lúc chuẩn bị giao); thiếu máy thì CEO tự quyết điều chuyển hay
-- mua mới — hệ thống không tự tạo máy tạm AUTO-CHOMUA nữa. App chặn tick
-- "Giao hàng & bàn giao" khi còn dòng chưa gán.

create or replace function public.check_order_equipment_line()
returns trigger as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
  v_has_rental_period boolean;
  v_parent_order uuid;
begin
  if tg_op = 'UPDATE'
     and new.equipment_type_id is not distinct from old.equipment_type_id
     and new.equipment_unit_id is not distinct from old.equipment_unit_id
     and new.equipment_instance_id is not distinct from old.equipment_instance_id
     and new.quantity is not distinct from old.quantity
     and new.order_id is not distinct from old.order_id
     and new.parent_line_id is not distinct from old.parent_line_id
  then
    return new;
  end if;

  if new.parent_line_id is not null then
    select order_id into v_parent_order from public.order_equipment where id = new.parent_line_id;
    if v_parent_order is distinct from new.order_id then
      raise exception 'Dòng con của combo phải cùng đơn với dòng combo';
    end if;
  end if;

  if new.equipment_type_id is null then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng hàng tự do không được gắn biến thể hoặc sản phẩm riêng lẻ';
    end if;
    return new;
  end if;

  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if v_product_type = 'service' then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng hàng dịch vụ không được gắn biến thể hoặc sản phẩm riêng lẻ';
    end if;
  elsif v_product_type = 'sale' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng bán phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng bán không dùng sản phẩm riêng lẻ';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type::text = 'combo' then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng combo không gắn biến thể/máy — các món nằm ở dòng con';
    end if;
    if new.parent_line_id is not null then
      raise exception 'Combo không lồng trong combo khác';
    end if;
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'quantity' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng cho thuê theo số lượng phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng cho thuê theo số lượng không dùng sản phẩm riêng lẻ';
    end if;
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'individual' then
    -- equipment_instance_id null = chưa gán serial (được phép).
    if new.equipment_unit_id is not null then
      raise exception 'Hàng cho thuê theo từng sản phẩm không dùng biến thể số lượng';
    end if;
    if new.quantity <> 1 then
      raise exception 'Hàng theo dõi riêng lẻ chỉ được số lượng 1';
    end if;
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- Gán / đổi / bỏ gán serial 1 dòng (p_instance_id null = bỏ gán). Máy đang ở
-- chỗ khách (đơn đã giao, chưa nhập kho): máy cũ về "Sẵn có", máy mới sang
-- "Đang cho thuê" trong cùng transaction. Đơn đã nhập kho/hoàn tất chỉ sửa
-- nhãn, không đụng kho. Giữ nguyên dòng, số lượng, đơn giá.
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
  v_tracking public.tracking_type;
  v_live boolean;
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;

  select id, order_id, equipment_type_id, equipment_instance_id
  into v_line
  from public.order_equipment
  where id = p_line_id
  for update;

  select tracking_type into v_tracking from public.equipment_types where id = v_line.equipment_type_id;
  if v_line.id is null or v_tracking is distinct from 'individual' then
    raise exception 'Dòng này không phải máy serial';
  end if;
  if v_line.equipment_instance_id is not distinct from p_instance_id then
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
  v_live := v_order.delivery_stock_moved_at is not null and v_order.return_stock_transferred_at is null;

  if p_instance_id is not null then
    select id, equipment_type_id, identifier_code, status
    into v_new
    from public.equipment_instances
    where id = p_instance_id
    for update;

    if v_new.id is null or v_new.equipment_type_id <> v_line.equipment_type_id then
      raise exception 'Máy mới phải cùng sản phẩm với dòng hàng';
    end if;
    if v_new.status = 'disposed' then
      raise exception 'Máy % đã thanh lý', v_new.identifier_code;
    end if;
    if v_live and v_new.status <> 'available' then
      raise exception 'Máy % không có sẵn trong kho', v_new.identifier_code;
    end if;
  end if;

  if v_live then
    if v_line.equipment_instance_id is not null then
      update public.equipment_instances
        set status = 'available'
        where id = v_line.equipment_instance_id and status = 'rented';
    end if;
    if p_instance_id is not null then
      update public.equipment_instances
        set status = 'rented'
        where id = p_instance_id;
    end if;
  end if;

  update public.order_equipment
    set equipment_instance_id = p_instance_id
    where id = p_line_id;
end;
$$;

grant execute on function public.swap_order_line_instance(uuid, uuid) to authenticated;
