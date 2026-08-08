-- ---------------------------------------------------------------------
-- CEO yêu cầu 2026-08-06: cho bỏ tick 1 khâu đã hoàn thành (VD khách đổi ý
-- sau khi đã chốt đơn/ký hợp đồng) — hiện chưa có nút nào trên UI để làm
-- việc này, phải sửa tay qua DB (xem BQ12223: undo khâu 3+4 thủ công).
--
-- 2 khâu "Giao hàng & bàn giao"/"Nhập kho & bảo trì" đụng tồn kho thật qua
-- deliver_order_stock()/return_order_stock() (migration 20260724030000) —
-- bỏ tick 2 khâu này phải hoàn tác đúng phần tồn kho đã trừ/cộng, không chỉ
-- xoá completed_date, nếu không tồn kho sẽ sai lệch với thực tế.
--
-- Cùng logic "clamp theo số thực tế" như 2 hàm gốc (không raise khi số liệu
-- đã lệch từ trước) — mirror ngược chiều di chuyển, dùng lại đúng cột đang
-- có (không cần bảng ghi log riêng "đã move bao nhiêu" vì 2 hàm gốc cũng
-- không lưu, giữ nhất quán độ chính xác với bản gốc).
-- ---------------------------------------------------------------------

-- Hoàn tác "Giao hàng & bàn giao": ở khách (chi nhánh giao) → trong kho lại,
-- sản phẩm riêng lẻ về "available". Idempotent qua delivery_stock_moved_at
-- (không làm gì nếu chưa từng trừ kho).
create function public.undo_deliver_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_line record;
  v_picked_up integer;
  v_move integer;
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;

  select id, pickup_branch_id, delivery_stock_moved_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  if v_order.delivery_stock_moved_at is null then
    return;
  end if;

  for v_line in
    select oe.equipment_unit_id, oe.equipment_instance_id, oe.quantity
    from public.order_equipment oe
    join public.equipment_types et on et.id = oe.equipment_type_id
    where oe.order_id = p_order_id
      and et.product_type = 'rental'
  loop
    if v_line.equipment_instance_id is not null then
      update public.equipment_instances
      set status = 'available'
      where id = v_line.equipment_instance_id;
    elsif v_line.equipment_unit_id is not null then
      select quantity_picked_up into v_picked_up
      from public.equipment_stock
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id
      for update;

      v_move := least(coalesce(v_picked_up, 0), v_line.quantity);
      if v_move <= 0 then
        continue;
      end if;

      update public.equipment_stock
      set quantity_picked_up = quantity_picked_up - v_move,
          quantity_in_stock = quantity_in_stock + v_move
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id;
    end if;
  end loop;

  update public.orders
  set delivery_stock_moved_at = null
  where id = p_order_id;
end;
$$;

grant execute on function public.undo_deliver_order_stock to authenticated;

-- Hoàn tác "Nhập kho & bảo trì": trong kho (chi nhánh thu hồi) → ở khách lại
-- (chi nhánh giao), sản phẩm riêng lẻ về "rented" + branch_id về chi nhánh
-- giao. Ghi thêm 1 dòng equipment_transfers khi 2 chi nhánh khác nhau — GIỮ
-- NGUYÊN dòng transfer gốc (sổ audit không cho sửa/xoá), chỉ log thêm dòng
-- hoàn tác để lịch sử đầy đủ 2 chiều.
create function public.undo_return_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_line record;
  v_in_stock integer;
  v_move integer;
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;

  select id, order_code, pickup_branch_id, return_branch_id, return_stock_transferred_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  if v_order.return_stock_transferred_at is null then
    return;
  end if;

  for v_line in
    select oe.equipment_unit_id, oe.equipment_instance_id, oe.quantity
    from public.order_equipment oe
    join public.equipment_types et on et.id = oe.equipment_type_id
    where oe.order_id = p_order_id
      and et.product_type = 'rental'
  loop
    if v_line.equipment_instance_id is not null then
      update public.equipment_instances
      set status = 'rented',
          branch_id = v_order.pickup_branch_id
      where id = v_line.equipment_instance_id;
    elsif v_line.equipment_unit_id is not null then
      select quantity_in_stock into v_in_stock
      from public.equipment_stock
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.return_branch_id
      for update;

      v_move := least(coalesce(v_in_stock, 0), v_line.quantity);
      if v_move <= 0 then
        continue;
      end if;

      update public.equipment_stock
      set quantity_in_stock = quantity_in_stock - v_move
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.return_branch_id;

      insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_picked_up)
      values (v_line.equipment_unit_id, v_order.pickup_branch_id, v_move)
      on conflict (equipment_unit_id, branch_id)
      do update set
        quantity_picked_up = public.equipment_stock.quantity_picked_up + excluded.quantity_picked_up;

      if v_order.return_branch_id <> v_order.pickup_branch_id then
        insert into public.equipment_transfers
          (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
        values
          (v_line.equipment_unit_id, v_order.return_branch_id, v_order.pickup_branch_id, v_move,
           'Tự động chuyển kho khi hoàn tác thu hồi đơn ' || v_order.order_code, public.auth_employee_id());
      end if;
    end if;
  end loop;

  update public.orders
  set return_stock_transferred_at = null
  where id = p_order_id;
end;
$$;

grant execute on function public.undo_return_order_stock to authenticated;
