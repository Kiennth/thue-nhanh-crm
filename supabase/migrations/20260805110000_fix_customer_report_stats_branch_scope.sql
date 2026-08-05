-- CEO 2026-08-05: "phần Khách hàng thì Nam Phương chỉ nhìn được Báo Cáo
-- Khách Hàng của chi nhánh bạn quản lý thôi" — customer_page_report(p_branch_id)
-- vốn đã lọc withOrders/returning2Plus/monthlyNew/returningRate/topCompanies/
-- debt đúng theo chi nhánh, NHƯNG 'stats.totalCustomers'/'individualCount'/
-- 'companyCount' bị bỏ sót: đọc thẳng từ cust_agg (LEFT JOIN từ TOÀN BỘ
-- customers, không lọc theo scoped orders) nên luôn đếm cả công ty bất kể
-- p_branch_id — Cửa hàng trưởng vẫn thấy "Tổng khách hàng"/"Cá nhân"/
-- "Doanh nghiệp" của cả công ty dù phần còn lại của report đã đúng chi
-- nhánh. Thêm scoped_cust_agg (khách có ít nhất 1 đơn chạm chi nhánh khi
-- p_branch_id có giá trị — cùng định nghĩa "khách liên quan chi nhánh" đã
-- dùng ở customer_page_list), đổi 'stats' đọc từ đây thay vì cust_agg.
create or replace function public.customer_page_report(p_branch_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with caller as (
  select role from public.employees where user_id = auth.uid() and is_active
),
active_orders as (
  select id, customer_id, total_value, order_date, pickup_branch_id, return_branch_id
  from public.orders
  where cancelled_at is null
),
scoped as (
  select * from active_orders
  where p_branch_id is null
     or pickup_branch_id = p_branch_id
     or return_branch_id = p_branch_id
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
-- "Khách của chi nhánh" = có ít nhất 1 đơn chạm chi nhánh đó — khi
-- p_branch_id null (Giám đốc/Admin/Kế toán) thì giữ nguyên toàn bộ khách.
scoped_cust_agg as (
  select * from cust_agg where p_branch_id is null or order_count > 0
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
    )
  )
end
$$;
