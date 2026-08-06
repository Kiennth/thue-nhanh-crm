-- ---------------------------------------------------------------------
-- Thêm báo cáo công nợ theo kỳ (tháng này/tháng trước/cả năm) vào
-- customer_page_report — CEO yêu cầu 2026-08-06 để các bạn theo dõi công
-- nợ phát sinh gần đây, không chỉ nhìn danh sách "10 khách nợ nhiều nhất"
-- (all-time, đã có sẵn ở field "debt").
--
-- Định nghĩa: với mỗi đơn (chưa huỷ, đã lọc branch giống mọi số liệu khác
-- trong hàm này) có order_date rơi vào kỳ đang xét, cộng phần CÒN THIẾU của
-- riêng đơn đó (giá trị đã gồm VAT trừ tổng đã thanh toán CHO ĐÚNG đơn đó,
-- không thấp hơn 0) — khác với field "debt" vốn tính công nợ DỒN theo từng
-- khách (không theo kỳ phát sinh). Giờ hiện tại lấy theo giờ VN, khớp cách
-- tính "months"/"company_first" đã có sẵn trong hàm.
--
-- Chỉ thêm 1 CTE + 1 key mới vào object trả về — không đổi bất kỳ field
-- nào đã có, không đổi customer_page_list.
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
monthly_new as (
  select m.month,
         count(ca.id)::int as cnt
  from months m
  left join cust_agg ca
    on ca.first_order is not null
   and ca.first_order = (select cf.first_order from company_first cf where cf.customer_id = ca.id)
   and to_char(ca.first_order::date, 'YYYY-MM') = m.month
  group by m.month
),
month_active as (
  select to_char(s.order_date::date, 'YYYY-MM') as month, s.customer_id
  from scoped s
  group by 1, 2
),
returning_rate as (
  select m.month,
         count(ma.customer_id)::int as active_count,
         count(ma.customer_id) filter (
           where (select cf.first_order from company_first cf where cf.customer_id = ma.customer_id)
                 < (m.month || '-01')::date
         )::int as returning_count
  from months m
  left join month_active ma on ma.month = m.month
  group by m.month
),
-- Công nợ CÒN THIẾU của từng đơn (không phải dồn theo khách) trong kỳ đang
-- xét — "tháng này"/"tháng trước"/"cả năm" tính theo order_date, giờ VN.
debt_by_period as (
  select
    coalesce(sum(greatest(0, round(s.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)))
      filter (where s.order_date >= date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date),
      0) as this_month,
    coalesce(sum(greatest(0, round(s.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)))
      filter (where s.order_date >= (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 month')::date
                and s.order_date < date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date),
      0) as last_month,
    coalesce(sum(greatest(0, round(s.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)))
      filter (where s.order_date >= date_trunc('year', now() at time zone 'Asia/Ho_Chi_Minh')::date),
      0) as this_year
  from scoped s
  left join paid p on p.order_id = s.id
)
select case
  when not exists (select 1 from caller) then
    jsonb_build_object('error', 'not_employee')
  else jsonb_build_object(
    'stats', (
      select jsonb_build_object(
        'totalCustomers', count(*),
        'individualCount', count(*) filter (where customer_type = 'individual'),
        'companyCount', count(*) filter (where customer_type = 'company'),
        'withOrders', count(*) filter (where order_count > 0),
        'returning2Plus', count(*) filter (where order_count >= 2)
      ) from scoped_cust_agg
    ),
    'monthlyNew', (
      select jsonb_agg(jsonb_build_object('month', month, 'count', cnt) order by month)
      from monthly_new
    ),
    'returningRate', (
      select jsonb_agg(jsonb_build_object(
        'month', month, 'activeCount', active_count, 'returningCount', returning_count
      ) order by month)
      from returning_rate
    ),
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
    'debtByPeriod', (
      select jsonb_build_object(
        'thisMonth', this_month,
        'lastMonth', last_month,
        'thisYear', this_year
      ) from debt_by_period
    )
  )
end
$$;
