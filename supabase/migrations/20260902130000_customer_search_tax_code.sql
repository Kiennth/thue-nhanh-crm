-- CEO 2026-09-02: ô tìm trang Khách hàng khớp thêm MÃ SỐ THUẾ (tiện cho kế
-- toán tra ngược từ hoá đơn). Chỉ thêm 1 vế or tax_code vào customer_page_list
-- — thân hàm còn lại giữ nguyên bản 20260902100000.
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
  select id, customer_id, total_value, (delivered_at is not null) as is_delivered
  from public.orders
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
         coalesce(sum(round(s.total_value * 1.08 * 100) / 100) filter (where s.is_delivered), 0)::numeric as total_revenue
  from public.customers c
  left join scoped s on s.customer_id = c.id
  where (p_search is null or p_search = ''
         or c.name ilike '%' || p_search || '%'
         or c.phone ilike '%' || p_search || '%'
         or c.tax_code ilike '%' || p_search || '%')
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
