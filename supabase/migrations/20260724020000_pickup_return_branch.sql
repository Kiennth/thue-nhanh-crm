-- Mỗi đơn có 2 chi nhánh riêng: nơi giao hàng (pickup) và nơi thu hồi
-- (return) — khách có thể lấy hàng ở Hà Nội, trả ở TP HCM. Doanh thu, khoán
-- và tồn kho vẫn tính theo chi nhánh giao (chi nhánh "sở hữu" đơn); chi
-- nhánh thu chỉ ảnh hưởng khâu thu hồi (danh sách đơn sắp về, quét RFID) và
-- việc tự động chuyển kho khi nhập kho.
alter table public.orders rename column branch_id to pickup_branch_id;
alter table public.orders add column return_branch_id uuid references public.branches(id);
update public.orders set return_branch_id = pickup_branch_id;
alter table public.orders alter column return_branch_id set not null;

-- Chống chuyển kho 2 lần khi khâu "Nhập kho & bảo trì" bị mở lại rồi hoàn
-- thành lại.
alter table public.orders add column return_stock_transferred_at timestamptz;

-- Tự động chuyển kho khi thu hồi đơn về chi nhánh khác chi nhánh giao.
-- Không dùng lại transfer_equipment_stock() vì hàm đó chỉ cho admin/kế toán
-- (security invoker) — khâu nhập kho có thể do kỹ thuật/sales hoàn thành,
-- nên hàm này là security definer và chỉ yêu cầu là nhân viên. Lượng chuyển
-- được clamp theo quantity_available thực tế (số liệu cũ có thể lệch) thay
-- vì raise exception — không để việc lệch tồn kho chặn khâu nhập kho.
create function public.transfer_order_return_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_line record;
  v_available integer;
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

  if v_order.pickup_branch_id = v_order.return_branch_id
     or v_order.return_stock_transferred_at is not null then
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
      set branch_id = v_order.return_branch_id
      where id = v_line.equipment_instance_id;
    elsif v_line.equipment_unit_id is not null then
      select quantity_available into v_available
      from public.equipment_stock
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id
      for update;

      v_move := least(coalesce(v_available, 0), v_line.quantity);
      if v_move <= 0 then
        continue;
      end if;

      update public.equipment_stock
      set quantity_total = quantity_total - v_move,
          quantity_available = quantity_available - v_move
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id;

      insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_total, quantity_available)
      values (v_line.equipment_unit_id, v_order.return_branch_id, v_move, v_move)
      on conflict (equipment_unit_id, branch_id)
      do update set
        quantity_total = public.equipment_stock.quantity_total + excluded.quantity_total,
        quantity_available = public.equipment_stock.quantity_available + excluded.quantity_available;

      insert into public.equipment_transfers
        (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
      values
        (v_line.equipment_unit_id, v_order.pickup_branch_id, v_order.return_branch_id, v_move,
         'Tự động chuyển kho khi thu hồi đơn ' || v_order.order_code, public.auth_employee_id());
    end if;
  end loop;

  update public.orders
  set return_stock_transferred_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.transfer_order_return_stock to authenticated;
