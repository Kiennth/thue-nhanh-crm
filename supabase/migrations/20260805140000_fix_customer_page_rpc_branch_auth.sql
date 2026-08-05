-- ---------------------------------------------------------------------
-- customer_page_report/customer_page_list nhận p_branch_id từ CLIENT mà
-- không đối chiếu với chi nhánh/vai trò thật của người gọi — hàm
-- security definer, chỉ check người gọi có phải nhân viên đang hoạt động,
-- KHÔNG chặn việc 1 Cửa hàng trưởng/Kỹ thuật-Sale tự gọi RPC với
-- p_branch_id = null (hoặc chi nhánh khác) để lấy báo cáo/xếp hạng/công nợ
-- toàn công ty — đúng phần UI cố tình giấu (showRankings/showDormant/
-- showDebt chỉ hiện khi !branchId, xem customers/page.tsx). UI chỉ là ràng
-- buộc phía client, không phải chặn thật.
--
-- Sửa: tính is_manage + effective_branch_id NGAY TRONG hàm dựa trên role
-- thật của auth.uid() (2 CTE 1-dòng, tham chiếu qua scalar subquery —
-- KHÔNG cross join trực tiếp vào FROM để tránh lỗi buộc nhầm LEFT JOIN kế
-- bên) — Giám đốc/Admin/Kế toán mới được dùng nguyên p_branch_id (kể cả
-- null = toàn công ty), còn lại LUÔN ép về đúng branch_id của chính họ
-- bất kể client truyền gì. "null = không lọc" CHỈ áp dụng khi is_manage =
-- true — nhân viên chi nhánh mà lỡ chưa gán branch_id (dữ liệu lỗi) sẽ ra
-- 0 dòng thay vì fail-open thấy hết.
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

create or replace function public.customer_page_list(
  p_branch_id uuid default null,
  p_search text default null,
  p_sort text default 'created_at',
  p_dir text default 'desc',
  p_page int default 1,
  p_page_size int default 20
)
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
scoped as (
  select id, customer_id, total_value from public.orders
  where cancelled_at is null
    and (
      ((select branch_id from effective) is null and (select v from is_manage))
      or pickup_branch_id = (select branch_id from effective)
      or return_branch_id = (select branch_id from effective)
    )
),
cust as (
  select c.*,
         count(s.id)::int as order_count,
         coalesce(sum(round(s.total_value * 1.08 * 100) / 100), 0)::numeric as total_revenue
  from public.customers c
  left join scoped s on s.customer_id = c.id
  where (p_search is null or p_search = ''
         or c.name ilike '%' || p_search || '%'
         or c.phone ilike '%' || p_search || '%')
    -- Xem theo chi nhánh: chỉ liệt kê khách có đơn liên quan chi nhánh đó
    -- (khớp bản JS: lọc customers theo tập customer_id của đơn chi nhánh).
    and (
      ((select branch_id from effective) is null and (select v from is_manage))
      or exists (select 1 from scoped s2 where s2.customer_id = c.id)
    )
  group by c.id
),
sorted as (
  select * from cust
  order by
    case when p_sort = 'name' and p_dir = 'asc' then name end asc,
    case when p_sort = 'name' and p_dir = 'desc' then name end desc,
    case when p_sort = 'customer_type' and p_dir = 'asc' then customer_type::text end asc,
    case when p_sort = 'customer_type' and p_dir = 'desc' then customer_type::text end desc,
    case when p_sort = 'orderCount' and p_dir = 'asc' then order_count end asc,
    case when p_sort = 'orderCount' and p_dir = 'desc' then order_count end desc,
    case when p_sort = 'totalRevenue' and p_dir = 'asc' then total_revenue end asc,
    case when p_sort = 'totalRevenue' and p_dir = 'desc' then total_revenue end desc,
    created_at desc
)
select case
  when not exists (select 1 from caller) then jsonb_build_object('error', 'not_employee')
  else jsonb_build_object(
    'totalCount', (select count(*) from cust),
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
        select * from sorted
        limit greatest(p_page_size, 1)
        offset greatest(p_page - 1, 0) * greatest(p_page_size, 1)
      ) t
    )
  )
end
$$;

revoke all on function public.customer_page_report(uuid) from anon;
revoke all on function public.customer_page_list(uuid, text, text, text, int, int) from anon;
