-- ---------------------------------------------------------------------
-- Gợi ý đầu tư thiết bị theo tỉ lệ lấp đầy (CEO chọn làm 2026-08-09,
-- mục 3/3): với từng loại hàng CHO THUÊ, tính % "ngày-thiết-bị" được
-- thuê trong p_days ngày qua so với sức chứa:
--   lấp đầy = tổng(số ngày khoảng thuê ∩ kỳ × số lượng trên dòng đơn)
--             / (sức chứa toàn công ty × số ngày kỳ)
-- Lấp đầy cao (>=70%) = đang từ chối khách vì thiếu hàng → mua thêm
-- hoàn vốn nhanh; thấp (<10%) quanh năm = ứng viên thanh lý.
--
-- Đơn tính: mọi đơn chưa huỷ có khoảng thuê chạm kỳ (kể cả đơn hoàn
-- tất — máy vẫn bận trong những ngày đó; đơn đang chạy cũng bận thật).
-- Sức chứa: cùng công thức order_schedule_conflicts (stock biến thể +
-- máy serialized chưa thanh lý, toàn công ty). Có thể vượt 100% nếu
-- nhận vượt kho — để nguyên, chính nó là tín hiệu thiếu hàng gắt nhất.
-- Gate: Giám đốc/Kế toán (cùng tập được xem báo cáo thiết bị).
-- ---------------------------------------------------------------------

create or replace function public.equipment_utilization(p_days int default 90)
returns table (
  equipment_type_id uuid,
  equipment_type_name text,
  capacity numeric,
  booked_unit_days numeric,
  utilization_pct numeric,
  orders_in_period int
)
language sql
stable
security definer
set search_path = public
as $$
with caller as (
  select role from public.employees where user_id = auth.uid() and is_active
),
bounds as (
  select now() - make_interval(days => greatest(p_days, 1)) as t0, now() as t1
),
cap as (
  select t.id, t.name,
         coalesce((
           select sum(es.quantity_total)
           from equipment_stock es
           join equipment_units u on u.id = es.equipment_unit_id
           where u.equipment_type_id = t.id
         ), 0)
         + coalesce((
           select count(*)
           from equipment_instances i
           where i.equipment_type_id = t.id
             and t.tracking_type = 'individual'
             and i.status <> 'disposed'
         ), 0) as total_qty
  from equipment_types t
  where t.product_type = 'rental'
),
booked as (
  select oe.equipment_type_id,
         sum(
           extract(epoch from (least(o.rental_end_at, b.t1) - greatest(o.rental_start_at, b.t0)))
             / 86400.0 * oe.quantity
         ) as unit_days,
         count(distinct o.id)::int as ord_count
  from orders o
  join order_equipment oe on oe.order_id = o.id
  cross join bounds b
  where o.cancelled_at is null
    and o.rental_start_at is not null
    and o.rental_end_at is not null
    and o.rental_start_at < b.t1
    and o.rental_end_at > b.t0
    and oe.equipment_type_id is not null
  group by oe.equipment_type_id
)
select
  c.id as equipment_type_id,
  c.name as equipment_type_name,
  c.total_qty as capacity,
  round(coalesce(bk.unit_days, 0)::numeric, 1) as booked_unit_days,
  case
    when c.total_qty > 0
    then round(100.0 * coalesce(bk.unit_days, 0) / (c.total_qty * greatest(p_days, 1)))
    else null
  end as utilization_pct,
  coalesce(bk.ord_count, 0) as orders_in_period
from cap c
left join booked bk on bk.equipment_type_id = c.id
where (select role from caller) in ('giam_doc', 'ke_toan')
  and (c.total_qty > 0 or coalesce(bk.unit_days, 0) > 0)
order by utilization_pct desc nulls last;
$$;

revoke all on function public.equipment_utilization(int) from anon;
