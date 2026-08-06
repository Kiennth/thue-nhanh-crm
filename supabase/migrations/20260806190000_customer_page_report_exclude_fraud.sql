-- ---------------------------------------------------------------------
-- CEO yêu cầu 2026-08-06: loại khách hàng "Huỳnh Trần Gia Lộc (lừa đảo đã
-- đi tù)" (id bf06492c-1b72-460d-974b-30a7e832b3db) khỏi mọi báo cáo tổng
-- hợp — số liệu đơn của khách này (doanh số, công nợ) là do lừa đảo, đưa
-- vào báo cáo tổng công ty sẽ làm sai lệch mọi con số tổng hợp (xếp hạng
-- doanh số, công nợ, donut tỉ trọng...) dùng để ra quyết định.
--
-- Lọc ngay từ active_orders (gốc rễ nhất — mọi CTE khác đều bắt nguồn từ
-- đây) để loại trừ nhất quán khỏi TOÀN BỘ phần tổng hợp trong hàm này.
-- KHÔNG đụng tới bảng orders/customers thật — khách hàng và lịch sử đơn
-- hàng của riêng khách này (trang chi tiết khách, danh sách đơn hàng) vẫn
-- giữ nguyên, chỉ loại khỏi số liệu TỔNG của công ty.
-- ---------------------------------------------------------------------

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
  select id, customer_id, total_value, order_date, pickup_branch_id, return_branch_id
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
  select order_id, sum(amount) as amt from public.order_payments group by 1
),
cust_agg as (
  select c.id, c.name, c.customer_type, c.phone,
         count(s.id)::int as order_count,
         coalesce(sum(round(s.total_value * 1.08 * 100) / 100), 0)::numeric as total_revenue,
         coalesce(sum(p.amt), 0)::numeric as total_paid,
         min(s.order_date) as first_order,
         max(s.order_date) as last_order
  from public.customers c
  left join scoped s on s.customer_id = c.id
  left join paid p on p.order_id = s.id
  group by c.id, c.name, c.customer_type, c.phone
),
scoped_cust_agg as (
  select * from cust_agg
  where (select v from is_manage) or order_count > 0
),
company_first as (
  select customer_id, min(order_date) as first_order from active_orders group by 1
),
months as (
  select to_char(date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))
                 - (interval '1 month' * g), 'YYYY-MM') as month
  from generate_series(11, 0, -1) as g
),
cust_agg_cf as (
  select ca.*, cf.first_order as company_first_order
  from cust_agg ca
  left join company_first cf on cf.customer_id = ca.id
),
monthly_new as (
  select m.month,
         count(ca.id)::int as cnt
  from months m
  left join cust_agg_cf ca
    on ca.first_order is not null
   and ca.first_order = ca.company_first_order
   and to_char(ca.first_order::date, 'YYYY-MM') = m.month
  group by m.month
),
month_active as (
  select to_char(s.order_date::date, 'YYYY-MM') as month, s.customer_id
  from scoped s
  group by 1, 2
),
month_active_cf as (
  select ma.*, cf.first_order as company_first_order
  from month_active ma
  left join company_first cf on cf.customer_id = ma.customer_id
),
returning_rate as (
  select m.month,
         count(ma.customer_id)::int as active_count,
         count(ma.customer_id) filter (
           where ma.company_first_order < (m.month || '-01')::date
         )::int as returning_count
  from months m
  left join month_active_cf ma on ma.month = m.month
  group by m.month
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
period_orders as (
  select pd.period, s.id, s.total_value
  from period_defs pd
  join scoped s
    on (pd.start_date is null or s.order_date >= pd.start_date)
   and (pd.end_date is null or s.order_date <= pd.end_date)
),
period_revenue_debt as (
  select po.period,
         coalesce(sum(round(po.total_value * 1.08 * 100) / 100), 0) as revenue,
         coalesce(sum(greatest(0, round(po.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0))), 0) as debt
  from period_orders po
  left join paid p on p.order_id = po.id
  group by po.period
),
period_new_customers as (
  select pd.period, count(ca.id)::int as cnt
  from period_defs pd
  join cust_agg_cf ca
    on ca.first_order is not null
   and ca.first_order = ca.company_first_order
   and (pd.start_date is null or ca.first_order >= pd.start_date)
   and (pd.end_date is null or ca.first_order <= pd.end_date)
  group by pd.period
),
period_orders_typed as (
  select pd.period, c.customer_type, s.id as order_id, s.customer_id, s.total_value
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
  from period_orders_typed
  group by period, customer_type
)
select case
  when not exists (select 1 from caller) then
    jsonb_build_object('error', 'not_employee')
  else jsonb_build_object(
    'topCompanies', (
      select coalesce(jsonb_agg(row_data), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', id, 'name', name, 'phone', phone,
          'orderCount', order_count, 'totalRevenue', total_revenue
        ) as row_data
        from scoped_cust_agg
        where customer_type = 'company' and total_revenue > 0
        order by total_revenue desc limit 10
      ) t
    ),
    'debt', (
      select coalesce(jsonb_agg(row_data), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', id, 'name', name, 'phone', phone,
          'orderCount', order_count,
          'totalOwed', greatest(0, total_revenue - total_paid)
        ) as row_data
        from scoped_cust_agg
        where greatest(0, total_revenue - total_paid) > 0
        order by greatest(0, total_revenue - total_paid) desc limit 10
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
