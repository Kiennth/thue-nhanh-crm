-- Khâu 7 "Vận hành / xử lý sự cố" là TUỲ CHỌN (CEO 2026-10-05): xong 6 khâu
-- đầu là đã giao (pick up); không cần hỗ trợ thì bỏ qua, nhảy thẳng khâu 8
-- Thu hồi. Trạng thái đơn = khâu bắt buộc đầu tiên chưa xong (bỏ qua khâu 7);
-- đơn hoàn tất khi đủ 9 khâu bắt buộc. Khâu 7 vẫn tick được bất cứ lúc nào.
create or replace function public.sync_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_next public.task_type;
  v_delivered timestamptz;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  select t.task_type into v_next
  from unnest(enum_range(null::public.task_type)) as t(task_type)
  where t.task_type <> 'van_hanh_xu_ly_su_co'
    and not exists (
      select 1 from public.order_tasks ot
      where ot.order_id = v_order_id
        and ot.task_type = t.task_type
        and ot.completed_date is not null
    )
  order by t.task_type
  limit 1;

  select min(ot.completed_date)::timestamptz into v_delivered
  from public.order_tasks ot
  where ot.order_id = v_order_id
    and ot.task_type = 'giao_hang_ban_giao'
    and ot.completed_date is not null;

  update public.orders
  set status = coalesce(v_next, 'nhap_kho_bao_tri'),
      completed_at = case when v_next is null then now() else completed_at end,
      delivered_at = v_delivered
  where id = v_order_id and completed_at is null;

  return null;
end;
$$;

-- Cập nhật trạng thái các đơn đang mở theo quy tắc mới (71 đơn đang đứng ở
-- khâu 7 → Thu hồi; không đơn nào đủ điều kiện hoàn tất).
update public.orders o
set status = sub.next_status
from (
  select o2.id,
    coalesce((
      select t.task_type
      from unnest(enum_range(null::public.task_type)) as t(task_type)
      where t.task_type <> 'van_hanh_xu_ly_su_co'
        and not exists (
          select 1 from public.order_tasks ot
          where ot.order_id = o2.id and ot.task_type = t.task_type and ot.completed_date is not null
        )
      order by t.task_type
      limit 1
    ), 'nhap_kho_bao_tri') as next_status
  from public.orders o2
  where o2.completed_at is null and o2.cancelled_at is null
) sub
where o.id = sub.id and o.status is distinct from sub.next_status;
