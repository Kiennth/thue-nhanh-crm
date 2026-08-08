-- ---------------------------------------------------------------------
-- CEO yêu cầu 2026-08-08: 2 bảng xếp hạng "Khách công ty - Doanh số cao
-- nhất" và "Công nợ - Còn nợ nhiều nhất" thêm toggle kỳ (mặc định Tháng
-- này) — trước giờ là số CỘNG DỒN toàn thời gian. Đổi topCompanies/debt
-- thành periodTopCompanies/periodDebt: jsonb map kỳ -> top-10, dùng chung
-- 5 kỳ period_defs với periodByCustomerType (khớp toggle `overview` sẵn có
-- trên trang — "Toàn thời gian" cho lại đúng số cộng dồn cũ).
--
-- "Còn nợ trong kỳ" = tổng thiếu của các đơn CÓ order_date rơi vào kỳ
-- (đồng nhất ngữ nghĩa với "Công nợ phát sinh" theo kỳ trước đây) — thanh
-- toán thì tính TOÀN BỘ lịch sử trả cho đơn đó, không giới hạn ngày trả.
--
-- Nhân tiện dọn các CTE chết (cust_agg/monthly_new/returning_rate/
-- period_revenue_debt/period_new_customers...) tồn từ các lần bỏ field
-- trước — Postgres không chạy CTE không được tham chiếu nên không đổi
-- hiệu năng, chỉ cho hàm đọc được.
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
-- Đơn trong kỳ kèm đủ thông tin khách — nguồn chung cho cả tương quan cá
-- nhân/công ty lẫn 2 bảng xếp hạng theo kỳ.
period_customer_orders as (
  select pd.period, c.id as customer_id, c.name, c.customer_type, c.phone,
         s.id as order_id, s.total_value
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
  group by period, customer_type
),
period_cust_agg as (
  select pco.period, pco.customer_id, pco.name, pco.customer_type, pco.phone,
         count(*)::int as order_count,
         sum(round(pco.total_value * 1.08 * 100) / 100) as total_revenue,
         sum(greatest(0, round(pco.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0))) as total_owed
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
                 'orderCount', order_count, 'totalRevenue', total_revenue
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
