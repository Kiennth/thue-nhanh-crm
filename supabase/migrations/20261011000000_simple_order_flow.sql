-- Luồng đơn 3 bước kiểu Booqable (CEO 2026-10-10/11: "đơn giản hoá đặt đơn –
-- pick up – return"; "10 khâu khoán có thể bổ sung sau — đó là nghiệp vụ để
-- tính lương"; "nếu để các khâu kế tiếp nhau thì các khâu sẽ bị kẹt").
-- Đã CHẠY THỬ (raise exception → rollback) 2026-10-11: 56 chưa chốt / 59 chờ
-- giao / 86 đang thuê / 34 đơn đã thu hồi → hoàn tất (51 máy serial về sẵn
-- có, 3 máy đang ở đơn khác giữ nguyên, 151 cái hàng số lượng về kho).
--
--   Chốt đơn (orders.confirmed_at) → Giao máy (delivery_stock_moved_at,
--   delivered_at = ngày ghi doanh số) → Nhận lại máy (return_stock_transferred_at
--   → completed_at: đơn hoàn tất; nợ/cọc vẫn theo dõi ở Công nợ).
--
-- orders.status vẫn là "khâu đang chờ" để view/báo cáo cũ chạy nguyên:
--   đã báo giá (chưa chốt) → bao_gia · chờ giao → giao_hang_ban_giao · đang ở khách →
--   thu_hoi · đã nhận lại → nhap_kho_bao_tri + completed_at.
-- 10 khâu (order_tasks) chỉ để tính khoán: tick bất kỳ thứ tự, bất kỳ lúc nào
-- (kể cả sau khi đơn hoàn tất), không chặn, không quyết định trạng thái.

-- ============ 1. Mốc chốt đơn ============
alter table public.orders add column if not exists confirmed_at timestamptz;

-- ============ 2. Bỏ ràng buộc tuần tự / trạng thái theo khâu ============
drop trigger if exists order_tasks_check_sequence on public.order_tasks;
drop trigger if exists order_tasks_sync_status on public.order_tasks;
drop trigger if exists orders_check_completion on public.orders;

-- ============ 3. Trạng thái theo luồng chính ============
create or replace function public.orders_flow_status()
  returns trigger language plpgsql set search_path = public as $$
  begin
    if new.cancelled_at is not null then return new; end if;
    if new.return_stock_transferred_at is not null then
      new.completed_at := coalesce(new.completed_at, new.return_stock_transferred_at);
      new.status := 'nhap_kho_bao_tri';
    elsif new.completed_at is not null then
      null;
    elsif new.delivery_stock_moved_at is not null then
      new.status := 'thu_hoi';
      new.confirmed_at := coalesce(new.confirmed_at, new.delivery_stock_moved_at);
      new.delivered_at := coalesce(new.delivered_at, new.delivery_stock_moved_at);
    elsif new.confirmed_at is not null then
      new.status := 'giao_hang_ban_giao';
      new.delivered_at := null;
    else
      new.delivered_at := null;
      -- Chưa chốt: 1 trạng thái "Đã báo giá (chưa chốt)" (CEO 2026-10-11).
      new.status := 'bao_gia';
    end if;
    return new;
  end;
  $$;

drop trigger if exists orders_flow_status on public.orders;
create trigger orders_flow_status
  before insert or update on public.orders
  for each row execute function public.orders_flow_status();

-- ============ 4. Trả kho: lõi dùng chung + chừa máy đã sang đơn khác ============
-- Máy serial đang nằm trên 1 đơn khác đã giao, chưa trả → KHÔNG đổi sang
-- "Sẵn có" (tránh đánh dấu rảnh máy đang ở khách khác).
create or replace function public.return_order_stock_core(p_order_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
  declare
    v_order record; v_line record; v_picked_up integer; v_move integer;
  begin
    select id, order_code, pickup_branch_id, return_branch_id, return_stock_transferred_at
    into v_order from public.orders where id = p_order_id for update;
    if v_order.id is null then raise exception 'Không tìm thấy đơn hàng'; end if;
    if v_order.return_stock_transferred_at is not null then return; end if;
    for v_line in
      select oe.equipment_unit_id, oe.equipment_instance_id, oe.quantity
      from public.order_equipment oe
      join public.equipment_types et on et.id = oe.equipment_type_id
      where oe.order_id = p_order_id and et.product_type = 'rental'
    loop
      if v_line.equipment_instance_id is not null then
        update public.equipment_instances i
        set status = 'available', branch_id = v_order.return_branch_id
        where i.id = v_line.equipment_instance_id
          and not exists (
            select 1 from public.order_equipment oe2
            join public.orders o2 on o2.id = oe2.order_id
            where oe2.equipment_instance_id = v_line.equipment_instance_id
              and o2.id <> p_order_id and o2.cancelled_at is null
              and o2.delivery_stock_moved_at is not null and o2.return_stock_transferred_at is null);
      elsif v_line.equipment_unit_id is not null then
        select quantity_picked_up into v_picked_up from public.equipment_stock
        where equipment_unit_id = v_line.equipment_unit_id and branch_id = v_order.pickup_branch_id for update;
        v_move := least(coalesce(v_picked_up, 0), v_line.quantity);
        if v_move <= 0 then continue; end if;
        update public.equipment_stock set quantity_picked_up = quantity_picked_up - v_move
        where equipment_unit_id = v_line.equipment_unit_id and branch_id = v_order.pickup_branch_id;
        insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
        values (v_line.equipment_unit_id, v_order.return_branch_id, v_move)
        on conflict (equipment_unit_id, branch_id)
        do update set quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;
        if v_order.return_branch_id <> v_order.pickup_branch_id then
          insert into public.equipment_transfers (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
          values (v_line.equipment_unit_id, v_order.pickup_branch_id, v_order.return_branch_id, v_move,
                  'Tự động chuyển kho khi thu hồi đơn ' || v_order.order_code, public.auth_employee_id());
        end if;
      end if;
    end loop;
    update public.orders set return_stock_transferred_at = now() where id = p_order_id;
  end;
  $$;

revoke all on function public.return_order_stock_core(uuid) from public, anon, authenticated;

create or replace function public.return_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;
  perform public.return_order_stock_core(p_order_id);
end;
$$;

-- ============ 5. Chuyển đơn đang mở sang luồng mới ============
update public.orders o
set confirmed_at = coalesce(
  (select min(t.completed_date)::timestamp at time zone 'Asia/Ho_Chi_Minh'
   from public.order_tasks t
   where t.order_id = o.id and t.completed_date is not null
     and t.task_type in ('chot_don', 'ky_hop_dong_thu_coc', 'chuan_bi', 'giao_hang_ban_giao')),
  o.delivery_stock_moved_at, o.created_at)
where o.completed_at is null and o.cancelled_at is null and o.confirmed_at is null
  and (o.delivery_stock_moved_at is not null
       or exists (select 1 from public.order_tasks t
                  where t.order_id = o.id and t.completed_date is not null
                    and t.task_type in ('chot_don', 'ky_hop_dong_thu_coc', 'chuan_bi', 'giao_hang_ban_giao')));

update public.orders set status = status where completed_at is null and cancelled_at is null;

-- Đơn đã Thu hồi (máy đã về) nhưng chưa trả kho: trả kho ngay (CEO đồng ý
-- 2026-10-11), ngày hoàn tất = ngày khâu Thu hồi.
do $mig$
declare
  r record;
begin
  for r in
    select o.id, t.completed_date
    from public.orders o
    join public.order_tasks t on t.order_id = o.id and t.task_type = 'thu_hoi' and t.completed_date is not null
    where o.completed_at is null and o.cancelled_at is null
      and o.delivery_stock_moved_at is not null and o.return_stock_transferred_at is null
  loop
    perform public.return_order_stock_core(r.id);
    update public.orders
    set completed_at = (r.completed_date + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
    where id = r.id;
  end loop;
end;
$mig$;

notify pgrst, 'reload schema';

-- ============ 6. Khách trả tiền = Chốt đơn ============
-- CEO 2026-10-11: "khách thanh toán (VietQR) là đơn tự nhảy từ Đã báo giá →
-- Chốt đơn". Mọi khoản THU (tiền thuê / tiền cọc) — QR tự ghi nhận, đối soát
-- ngân hàng, nhân viên ghi tay — đều chốt đơn đang "Đã báo giá". Hoàn cọc
-- không tính. Khoán 3 khâu đầu (Tiếp nhận → Báo giá → Chốt đơn) tự ghi cho
-- người làm báo giá (khâu Báo giá; chưa có thì người tạo đơn) — CEO 11/10,
-- giống khách bấm Đồng ý ở link báo giá. Khâu đã xong giữ nguyên; khâu đã có
-- người nhận thì ghi cho người đó.
create or replace function public.order_payments_confirm_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_quoter uuid;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if new.payment_type not in ('invoice', 'deposit_collect') then
    return new;
  end if;

  update public.orders
  set confirmed_at = now()
  where id = new.order_id
    and confirmed_at is null
    and cancelled_at is null
    and completed_at is null
  returning created_by into v_created_by;
  if not found then
    return new;
  end if;

  select employee_id into v_quoter
  from public.order_tasks
  where order_id = new.order_id and task_type = 'bao_gia';
  v_quoter := coalesce(v_quoter, v_created_by);
  if v_quoter is null then
    return new;
  end if;

  insert into public.order_tasks (order_id, task_type, employee_id, completed_date, note)
  select new.order_id, t, v_quoter, v_today, 'Tự chốt khi khách thanh toán'
  from unnest(array['tiep_nhan_yeu_cau', 'bao_gia', 'chot_don']::public.task_type[]) as t
  on conflict (order_id, task_type) do update
    set employee_id = coalesce(public.order_tasks.employee_id, excluded.employee_id),
        completed_date = excluded.completed_date,
        note = coalesce(public.order_tasks.note, excluded.note)
    where public.order_tasks.completed_date is null;
  return new;
end;
$$;

drop trigger if exists order_payments_confirm_order on public.order_payments;
create trigger order_payments_confirm_order
  after insert on public.order_payments
  for each row execute function public.order_payments_confirm_order();
