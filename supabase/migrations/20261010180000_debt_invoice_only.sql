-- CEO 10/10 (tách gọn CRM giai đoạn 3): "Đã trả" ở Công nợ chỉ tính khoản
-- thanh toán HOÁ ĐƠN (payment_type = 'invoice'). Cọc (deposit_collect /
-- deposit_refund) là tiền giữ hộ, trước bị cộng nhầm làm nợ thấp đi. Cùng
-- định nghĩa với danh sách đơn / Hôm nay (migration 20261010170000) và
-- trang chi tiết đơn. Sửa 2 hàm: debt_aging_report (trang Công nợ) và
-- customer_page_report (bảng "Còn nợ nhiều nhất" ở Khách hàng).

-- ============ 1. debt_aging_report ============
create or replace function public.debt_aging_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with caller as (
  select role from public.employees where user_id = auth.uid() and is_active
),
paid as (
  select order_id, sum(amount) as amt from public.order_payments where payment_type = 'invoice' group by 1
),
unpaid as (
  select o.customer_id,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date - o.order_date as age_days,
         greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) as remaining
  from public.orders o
  left join paid p on p.order_id = o.id
  where o.cancelled_at is null
    and o.delivered_at is not null
    and o.customer_id <> 'bf06492c-1b72-460d-974b-30a7e832b3db'
    and greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) > 0
),
per_customer as (
  select
    c.id as customer_id,
    c.name as customer_name,
    c.phone,
    sum(u.remaining) as total_owed,
    coalesce(sum(u.remaining) filter (where u.age_days <= 30), 0) as bucket_0_30,
    coalesce(sum(u.remaining) filter (where u.age_days between 31 and 60), 0) as bucket_31_60,
    coalesce(sum(u.remaining) filter (where u.age_days between 61 and 90), 0) as bucket_61_90,
    coalesce(sum(u.remaining) filter (where u.age_days > 90), 0) as bucket_90_plus,
    max(u.age_days)::int as oldest_debt_days,
    count(*)::int as unpaid_order_count
  from unpaid u
  join public.customers c on c.id = u.customer_id
  group by c.id, c.name, c.phone
)
select case
  when (select role from caller) not in ('giam_doc', 'admin', 'ke_toan') then
    jsonb_build_object('error', 'forbidden')
  else jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'totalOwed', coalesce(sum(total_owed), 0),
        'bucket0_30', coalesce(sum(bucket_0_30), 0),
        'bucket31_60', coalesce(sum(bucket_31_60), 0),
        'bucket61_90', coalesce(sum(bucket_61_90), 0),
        'bucket90Plus', coalesce(sum(bucket_90_plus), 0),
        'customerCount', count(*)
      ) from per_customer
    ),
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
        select * from per_customer
        order by oldest_debt_days desc, total_owed desc
        limit 300
      ) t
    )
  )
end;
$$;

revoke all on function public.debt_aging_report() from anon;

create or replace function public.customer_page_report(p_branch_id uuid default null)
returns jsonb
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
active_orders as (
  -- Kỳ doanh số theo NGÀY GIAO (giờ VN); đơn chưa giao vẫn theo ngày tạo đơn
  -- (chỉ dùng đếm số đơn) — CEO 2026-10-05.
  select id, customer_id, total_value,
         coalesce((delivered_at at time zone 'Asia/Ho_Chi_Minh')::date, order_date) as order_date,
         pickup_branch_id, return_branch_id,
         (delivered_at is not null) as is_delivered
  from public.orders
  where cancelled_at is null
    and customer_id <> 'bf06492c-1b72-460d-974b-30a7e832b3db'
),
scoped as (
  select * from active_orders
  where ((select branch_id from effective) is null and (select v from is_manage))
     or pickup_branch_id = (select branch_id from effective)
     or return_branch_id = (select branch_id from effective)
),
paid as (
  select order_id, sum(amount) as amt from public.order_payments where payment_type = 'invoice' group by 1
),
period_defs as (
  select * from (values
    ('thisMonth'::text,
      date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date,
      (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 month' - interval '1 day')::date),
    ('lastMonth'::text,
      (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 month')::date,
      (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 day')::date),
    ('thisYear'::text,
      date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh')::date,
      (date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 year' - interval '1 day')::date),
    ('lastYear'::text,
      (date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 year')::date,
      (date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 day')::date),
    ('allTime'::text, null::date, null::date)
  ) as t(period, start_date, end_date)
),
period_customer_orders as (
  select pd.period, c.id as customer_id, c.name, c.customer_type, c.phone,
         s.id as order_id, s.total_value, s.is_delivered
  from period_defs pd
  join scoped s
    on (pd.start_date is null or s.order_date >= pd.start_date)
   and (pd.end_date is null or s.order_date <= pd.end_date)
  join public.customers c on c.id = s.customer_id
),
period_type_stats as (
  select period, customer_type,
         count(distinct customer_id)::int as customer_count,
         count(*)::int as order_count,
         coalesce(sum(round(total_value * 1.08 * 100) / 100), 0) as revenue
  from period_customer_orders
  where is_delivered
  group by period, customer_type
),
period_cust_agg as (
  select pco.period, pco.customer_id, pco.name, pco.customer_type, pco.phone,
         count(*) filter (where pco.is_delivered)::int as delivered_order_count,
         count(*)::int as order_count,
         coalesce(sum(round(pco.total_value * 1.08 * 100) / 100) filter (where pco.is_delivered), 0) as total_revenue,
         coalesce(sum(greatest(0, round(pco.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0))) filter (where pco.is_delivered), 0) as total_owed
  from period_customer_orders pco
  left join paid p on p.order_id = pco.order_id
  group by pco.period, pco.customer_id, pco.name, pco.customer_type, pco.phone
),
period_company_rank as (
  select *, row_number() over (partition by period order by total_revenue desc) as rn
  from period_cust_agg
  where customer_type = 'company' and total_revenue > 0
),
period_debt_rank as (
  select *, row_number() over (partition by period order by total_owed desc) as rn
  from period_cust_agg
  where total_owed > 0
)
select case
  when not exists (select 1 from caller) then
    jsonb_build_object('error', 'not_employee')
  else jsonb_build_object(
    'periodTopCompanies', (
      select coalesce(jsonb_object_agg(period, rows), '{}'::jsonb) from (
        select period,
               jsonb_agg(jsonb_build_object(
                 'id', customer_id, 'name', name, 'phone', phone,
                 'orderCount', delivered_order_count, 'totalRevenue', total_revenue
               ) order by rn) as rows
        from period_company_rank
        where rn <= 10
        group by period
      ) t
    ),
    'periodDebt', (
      select coalesce(jsonb_object_agg(period, rows), '{}'::jsonb) from (
        select period,
               jsonb_agg(jsonb_build_object(
                 'id', customer_id, 'name', name, 'phone', phone,
                 'orderCount', order_count, 'totalOwed', total_owed
               ) order by rn) as rows
        from period_debt_rank
        where rn <= 10
        group by period
      ) t
    ),
    'periodByCustomerType', (
      select coalesce(jsonb_object_agg(pd.period, jsonb_build_object(
        'individual', jsonb_build_object(
          'customerCount', coalesce(ind.customer_count, 0),
          'orderCount', coalesce(ind.order_count, 0),
          'revenue', coalesce(ind.revenue, 0)
        ),
        'company', jsonb_build_object(
          'customerCount', coalesce(comp.customer_count, 0),
          'orderCount', coalesce(comp.order_count, 0),
          'revenue', coalesce(comp.revenue, 0)
        )
      )), '{}'::jsonb)
      from period_defs pd
      left join period_type_stats ind on ind.period = pd.period and ind.customer_type = 'individual'
      left join period_type_stats comp on comp.period = pd.period and comp.customer_type = 'company'
    )
  )
end
$$;


notify pgrst, 'reload schema';
