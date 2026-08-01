-- CEO phản ánh: nút "Hoàn tất đơn" nằm cách xa checklist 10 khâu, phải kéo
-- lên đầu trang bấm riêng — muốn tick xong khâu thứ 10 là đơn tự đóng luôn,
-- không cần thao tác thêm. Mở rộng sync_order_status() (đã chạy sau mỗi lần
-- sửa order_tasks) để tự set completed_at khi không còn khâu nào dang dở.
--
-- Giữ nguyên semantics cũ: chỉ động vào đơn khi completed_at đang null (đơn
-- đã đóng thì "đứng hình", phải bấm "Mở lại đơn" mới sync lại — xem
-- reopenOrder() trong src/lib/actions/orders.ts). Trigger orders_check_completion
-- vẫn còn nguyên nên dù có lỡ set completed_at khi thiếu khâu (không thể xảy
-- ra ở đây vì v_next is null nghĩa là đủ cả 10) cũng bị chặn lại.
create or replace function public.sync_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_next public.task_type;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  select t.task_type into v_next
  from unnest(enum_range(null::public.task_type)) as t(task_type)
  where not exists (
    select 1 from public.order_tasks ot
    where ot.order_id = v_order_id
      and ot.task_type = t.task_type
      and ot.completed_date is not null
  )
  order by t.task_type
  limit 1;

  update public.orders
  set status = coalesce(v_next, 'nhap_kho_bao_tri'),
      completed_at = case when v_next is null then now() else completed_at end
  where id = v_order_id and completed_at is null;

  return null;
end;
$$;

-- Dọn luôn các đơn đang kẹt sẵn ở 10/10 khâu từ trước khi có auto-complete
-- (vd BQ11779) — trigger ở trên chỉ chạy khi có insert/update/delete MỚI
-- trên order_tasks nên không tự áp dụng ngược cho các đơn đã kẹt sẵn.
update public.orders o
set completed_at = now()
where o.completed_at is null
  and o.cancelled_at is null
  and (
    select count(*) from public.order_tasks ot
    where ot.order_id = o.id and ot.completed_date is not null
  ) >= 10;
