-- Tồn kho 3 trạng thái cho hàng cho thuê theo số lượng (theo mô hình
-- Booqable): trong kho (sẵn sàng cho thuê) / đang ở khách / bảo trì.
-- quantity_total trở thành cột generated = tổng 3 trạng thái để các báo cáo
-- đang đọc quantity_total không phải đổi. Từ nay tồn kho phản ánh vật lý:
-- hoàn thành khâu "Giao hàng & bàn giao" trừ kho sang "ở khách", hoàn thành
-- khâu "Nhập kho & bảo trì" trả về "trong kho" tại chi nhánh thu hồi.

alter table public.equipment_stock
  add column quantity_in_stock integer not null default 0 check (quantity_in_stock >= 0),
  add column quantity_picked_up integer not null default 0 check (quantity_picked_up >= 0),
  add column quantity_downtime integer not null default 0 check (quantity_downtime >= 0);

-- Backfill: "sẵn có" cũ → trong kho; phần chênh total - available (nếu có do
-- sửa tay trước đây) → bảo trì, vì hệ thống cũ không phân biệt được lý do
-- không sẵn có — chỉnh lại tay sau nếu thực tế là hàng đang ở khách.
update public.equipment_stock
  set quantity_in_stock = quantity_available,
      quantity_downtime = quantity_total - quantity_available;

alter table public.equipment_stock drop constraint equipment_stock_available_not_over_total;
alter table public.equipment_stock drop column quantity_available;
alter table public.equipment_stock drop column quantity_total;
alter table public.equipment_stock add column quantity_total integer
  generated always as (quantity_in_stock + quantity_picked_up + quantity_downtime) stored;

-- Chống trừ kho 2 lần khi khâu giao hàng bị mở lại rồi hoàn thành lại.
alter table public.orders add column delivery_stock_moved_at timestamptz;

-- ---------------------------------------------------------------------------
-- Viết lại 3 function cũ: chỉ thao tác quantity_in_stock (quantity_total giờ
-- là cột generated, không ghi trực tiếp được).
-- ---------------------------------------------------------------------------

create or replace function public.transfer_equipment_stock(
  p_equipment_unit_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_quantity integer,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_in_stock integer;
begin
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền chuyển kho';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Chi nhánh nguồn và đích phải khác nhau';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng chuyển phải lớn hơn 0';
  end if;

  select quantity_in_stock into v_in_stock
  from public.equipment_stock
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id
  for update;

  if v_in_stock is null or v_in_stock < p_quantity then
    raise exception 'Không đủ số lượng trong kho ở chi nhánh nguồn';
  end if;

  update public.equipment_stock
  set quantity_in_stock = quantity_in_stock - p_quantity
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
  values (p_equipment_unit_id, p_to_branch_id, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;

  insert into public.equipment_transfers
    (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
  values
    (p_equipment_unit_id, p_from_branch_id, p_to_branch_id, p_quantity, p_note, public.auth_employee_id());
end;
$$;

create or replace function public.record_equipment_purchase(
  p_equipment_unit_id uuid,
  p_branch_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_purchase_date date,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
begin
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền mua hàng';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng mua phải lớn hơn 0';
  end if;

  if p_unit_cost < 0 then
    raise exception 'Giá mua không được âm';
  end if;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
  values (p_equipment_unit_id, p_branch_id, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;

  insert into public.equipment_purchases
    (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_cost, p_purchase_date, p_note, public.auth_employee_id());
end;
$$;

create or replace function public.record_equipment_disposal(
  p_equipment_unit_id uuid,
  p_branch_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_disposal_date date,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_in_stock integer;
begin
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền bán/thanh lý';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng bán phải lớn hơn 0';
  end if;

  if p_unit_price < 0 then
    raise exception 'Giá bán không được âm';
  end if;

  select quantity_in_stock into v_in_stock
  from public.equipment_stock
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id
  for update;

  if v_in_stock is null or v_in_stock < p_quantity then
    raise exception 'Không đủ số lượng trong kho để thanh lý';
  end if;

  update public.equipment_stock
  set quantity_in_stock = quantity_in_stock - p_quantity
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id;

  insert into public.equipment_disposals
    (equipment_unit_id, branch_id, quantity, unit_price, disposal_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_price, p_disposal_date, p_note, public.auth_employee_id());
end;
$$;

-- ---------------------------------------------------------------------------
-- Hook luồng đơn hàng. Cùng pattern transfer_order_return_stock cũ: security
-- definer + is_employee() (kỹ thuật/sales cũng hoàn thành khâu được), lock
-- đơn for update, clamp theo số thực tế thay vì raise (số liệu cũ có thể
-- lệch — không để lệch tồn kho chặn việc hoàn thành khâu), idempotent qua
-- timestamp trên orders.
-- ---------------------------------------------------------------------------

-- Giao hàng: trong kho → ở khách tại chi nhánh giao; sản phẩm riêng lẻ sang
-- "Đang cho thuê".
create function public.deliver_order_stock(p_order_id uuid)
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

  select id, pickup_branch_id, delivery_stock_moved_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  if v_order.delivery_stock_moved_at is not null then
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
      set status = 'rented'
      where id = v_line.equipment_instance_id;
    elsif v_line.equipment_unit_id is not null then
      select quantity_in_stock into v_in_stock
      from public.equipment_stock
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id
      for update;

      v_move := least(coalesce(v_in_stock, 0), v_line.quantity);
      if v_move <= 0 then
        continue;
      end if;

      update public.equipment_stock
      set quantity_in_stock = quantity_in_stock - v_move,
          quantity_picked_up = quantity_picked_up + v_move
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id;
    end if;
  end loop;

  update public.orders
  set delivery_stock_moved_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.deliver_order_stock to authenticated;

-- Thu hồi/nhập kho: ở khách (chi nhánh giao) → trong kho (chi nhánh thu hồi,
-- có thể trùng chi nhánh giao); sản phẩm riêng lẻ về "Sẵn có" + đúng chi
-- nhánh thu hồi. Thay thế transfer_order_return_stock cũ (giờ xử lý cả
-- trường hợp 2 chi nhánh trùng nhau — vẫn phải trả "ở khách" về "trong kho").
drop function public.transfer_order_return_stock(uuid);

create function public.return_order_stock(p_order_id uuid)
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

  select id, order_code, pickup_branch_id, return_branch_id, return_stock_transferred_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  if v_order.return_stock_transferred_at is not null then
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
      set status = 'available',
          branch_id = v_order.return_branch_id
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
      set quantity_picked_up = quantity_picked_up - v_move
      where equipment_unit_id = v_line.equipment_unit_id
        and branch_id = v_order.pickup_branch_id;

      insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
      values (v_line.equipment_unit_id, v_order.return_branch_id, v_move)
      on conflict (equipment_unit_id, branch_id)
      do update set
        quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;

      if v_order.return_branch_id <> v_order.pickup_branch_id then
        insert into public.equipment_transfers
          (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
        values
          (v_line.equipment_unit_id, v_order.pickup_branch_id, v_order.return_branch_id, v_move,
           'Tự động chuyển kho khi thu hồi đơn ' || v_order.order_code, public.auth_employee_id());
      end if;
    end if;
  end loop;

  update public.orders
  set return_stock_transferred_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.return_order_stock to authenticated;
