-- Trang /customers trước đây kéo NGUYÊN 3 bảng (5.5k khách + 10k đơn + 6k
-- thanh toán ~ 21.000 dòng, ~24 lượt gọi) về Worker chỉ để cộng trừ ra vài
-- chục con số. Đẩy phần tổng hợp xuống Postgres: 1 lượt gọi, trả về đúng
-- phần hiển thị. Giữ NGUYÊN semantics của lib/customer-reports.ts:
--   - chỉ tính đơn CHƯA huỷ; doanh số = total_value * 1.08 (gồm VAT), làm
--     tròn 2 chữ số TỪNG ĐƠN rồi mới cộng;
--   - total_paid cộng mọi order_payments của đơn (không lọc payment_type —
--     khớp bản JS hiện tại);
--   - "khách mới" theo tháng = khách có đơn đầu tiên TOÀN CÔNG TY nằm trong
--     tháng đó VÀ (khi xem theo chi nhánh) đơn đầu công ty trùng đơn đầu
--     trong phạm vi chi nhánh;
--   - tỉ lệ quay lại tháng = trong số khách có đơn tháng đó, % người có đơn
--     đầu công ty TRƯỚC đầu tháng.
-- security definer + kiểm tra người gọi là nhân viên: cần đọc đơn của MỌI
-- chi nhánh để tính mốc "công ty" trong khi RLS cắt orders theo chi nhánh
-- với Cửa hàng trưởng/Kỹ thuật-Sales.

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
      ) from cust_agg
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
        from cust_agg
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
        from cust_agg
        where greatest(0, total_revenue - total_paid) > 0
        order by greatest(0, total_revenue - total_paid) desc limit 10
      ) t
    )
  )
end
$$;

-- Danh sách khách phân trang/tìm kiếm/sắp xếp phía DB — thay cho việc kéo cả
-- bảng rồi cắt trang trong JS. Sort key khớp các cột của bảng hiện tại.
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
  select 1 from public.employees where user_id = auth.uid() and is_active
),
scoped as (
  select id, customer_id, total_value from public.orders
  where cancelled_at is null
    and (p_branch_id is null or pickup_branch_id = p_branch_id or return_branch_id = p_branch_id)
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
    and (p_branch_id is null or exists (select 1 from scoped s2 where s2.customer_id = c.id))
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
