-- Hiệu quả từng mã hàng (CEO 2026-10-04, đề xuất số 6): tỷ lệ máy được thuê,
-- doanh thu / máy, nằm kho bao lâu — để quyết định mua thêm / thanh lý. Cùng
-- phạm vi quyền + kho như equipment_page_report (Giám đốc/Admin/Kế toán chọn
-- kho, người khác bị ép về kho mình).
--   units           : máy serial chưa thanh lý (bỏ máy tạm CHỜ MUA) + tồn số lượng (hiện tại)
--   rented_unit_days: Σ số lượng × số ngày nằm ở khách trong kỳ (đơn đã giao/xuất kho)
--   period_days     : số ngày của kỳ tính tới hiện tại
--   revenue         : Σ line_total đơn đã giao có order_date trong kỳ (giống báo cáo cũ)
--   last_return_at  : lần trả gần nhất; on_rent_now = đang ở chỗ khách
create or replace function public.equipment_performance_report(
  p_branch_id uuid default null,
  p_start date default null,
  p_end date default null
)
returns table (
  equipment_type_id uuid,
  units numeric,
  rented_unit_days numeric,
  period_days numeric,
  revenue numeric,
  rental_count int,
  last_return_at timestamptz,
  on_rent_now boolean
)
language sql
stable
security definer
set search_path = public
as $$
with caller as (
  select role, branch_id from public.employees where user_id = auth.uid() and is_active
),
is_manage as (
  select coalesce((select role from caller) in ('giam_doc', 'admin', 'ke_toan'), false) as v
),
effective as (
  select case when (select v from is_manage) then p_branch_id else (select branch_id from caller) end as branch_id
),
bounds as (
  select
    coalesce(
      (p_start::timestamp at time zone 'Asia/Ho_Chi_Minh'),
      (select min(rental_start_at) from public.orders where cancelled_at is null)
    ) as t0,
    least(coalesce(((p_end + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'), now()), now()) as t1
),
rtypes as (
  select id from public.equipment_types
  where product_type = 'rental' and coalesce(tracking_type::text, '') <> 'combo'
),
inst as (
  select i.equipment_type_id, count(*)::numeric as qty
  from public.equipment_instances i
  where i.status <> 'disposed'
    and i.identifier_code not like 'AUTO-CHOMUA%'
    and ((select branch_id from effective) is null or i.branch_id = (select branch_id from effective))
  group by 1
),
stk as (
  select u.equipment_type_id,
         sum(s.quantity_in_stock + s.quantity_picked_up + s.quantity_downtime)::numeric as qty
  from public.equipment_stock s
  join public.equipment_units u on u.id = s.equipment_unit_id
  where (select branch_id from effective) is null or s.branch_id = (select branch_id from effective)
  group by 1
),
ord as (
  select id, rental_start_at, rental_end_at, completed_at, order_date, delivered_at
  from public.orders
  where cancelled_at is null
    and (delivered_at is not null or delivery_stock_moved_at is not null)
    and rental_start_at is not null
    and rental_end_at is not null
    and (
      (select branch_id from effective) is null
      or pickup_branch_id = (select branch_id from effective)
      or return_branch_id = (select branch_id from effective)
    )
),
lines as (
  select oe.equipment_type_id, oe.quantity, oe.line_total, o.rental_start_at, o.rental_end_at,
         o.completed_at, o.order_date, o.delivered_at
  from public.order_equipment oe
  join ord o on o.id = oe.order_id
  where oe.equipment_type_id in (select id from rtypes)
),
usage as (
  select equipment_type_id,
         sum(quantity * greatest(0, extract(epoch from (
           least(rental_end_at, (select t1 from bounds)) - greatest(rental_start_at, (select t0 from bounds))
         )) / 86400.0)) as rud
  from lines
  group by 1
),
rev as (
  select equipment_type_id, sum(line_total) as revenue, count(*) as cnt
  from lines
  where delivered_at is not null
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
  group by 1
),
last_ret as (
  select equipment_type_id,
         max(rental_end_at) filter (where rental_end_at <= now()) as last_end,
         bool_or(completed_at is null and rental_start_at <= now()) as on_rent
  from lines
  group by 1
)
select
  t.id as equipment_type_id,
  coalesce(i.qty, 0) + coalesce(s.qty, 0) as units,
  round(coalesce(u.rud, 0)::numeric, 1) as rented_unit_days,
  round((greatest(0, extract(epoch from ((select t1 from bounds) - (select t0 from bounds)))) / 86400.0)::numeric, 1) as period_days,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.cnt, 0)::int as rental_count,
  l.last_end as last_return_at,
  coalesce(l.on_rent, false) as on_rent_now
from public.equipment_types t
left join inst i on i.equipment_type_id = t.id
left join stk s on s.equipment_type_id = t.id
left join usage u on u.equipment_type_id = t.id
left join rev r on r.equipment_type_id = t.id
left join last_ret l on l.equipment_type_id = t.id
where t.id in (select id from rtypes)
  and exists (select 1 from caller);
$$;

revoke all on function public.equipment_performance_report(uuid, date, date) from public, anon;
grant execute on function public.equipment_performance_report(uuid, date, date) to authenticated;
