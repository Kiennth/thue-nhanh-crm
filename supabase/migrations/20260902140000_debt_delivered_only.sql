-- CEO 2026-09-02: "đơn chưa giao hàng thì chưa tính là công nợ" (vd BQ12601
-- đặt trước — khách còn đổi ý được). PHẢI THU/CÔNG NỢ giờ cùng mốc với
-- doanh số: chỉ đơn ĐÃ GIAO (delivered_at) và chưa huỷ. Sửa 3 hàm:
--   1. debt_aging_report (trang Công nợ)
--   2. orders_page_list (vatRevenue/unpaidCount/unpaidAmount + lọc
--      p_unpaid_only) — deliveredUnpaidAmount giờ trùng unpaidAmount,
--      giữ cả 2 field cho UI khỏi đổi.
--   3. customer_page_report (bảng "Còn nợ nhiều nhất")
-- Đơn đặt trước có cọc đã thu vẫn thấy ở phần Thanh toán của từng đơn —
-- chỉ không bị đòi như nợ.

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
  select order_id, sum(amount) as amt from public.order_payments group by 1
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

-- ============ 2. orders_page_list ============
create or replace function public.orders_page_list(
  p_branch_id uuid default null,
  p_status text default 'all',
  p_range_start date default null,
  p_range_end date default null,
  p_search text default null,
  p_sort text default null,
  p_dir text default 'asc',
  p_page int default 1,
  p_page_size int default 20,
  p_unpaid_only boolean default false
)
returns jsonb
language sql
stable
set search_path = public
as $$
with paid as (
  select order_id, sum(amount) as amt from public.order_payments group by 1
),
base as (
  select
    o.id, o.order_code, o.pickup_branch_id, o.return_branch_id, o.customer_id,
    o.rental_start_at, o.rental_end_at, o.total_value, o.status, o.order_date,
    o.completed_at, o.cancelled_at, o.delivered_at,
    c.name as customer_name,
    round(o.total_value * 1.08 * 100) / 100 as vat_total,
    greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) as remaining,
    case
      when o.cancelled_at is not null then 4
      when o.completed_at is not null then 6
      else (case o.status
        when 'bao_gia' then 1
        when 'chot_don' then 2
        when 'chuan_bi' then 3
        when 'giao_hang_ban_giao' then 5
        when 'ky_hop_dong_thu_coc' then 7
        when 'nghiem_thu' then 8
        when 'nhap_kho_bao_tri' then 9
        when 'thu_hoi' then 10
        when 'tiep_nhan_yeu_cau' then 11
        when 'van_hanh_xu_ly_su_co' then 12
      end)
    end as status_rank
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join paid p on p.order_id = o.id
  where
    (p_branch_id is null or o.pickup_branch_id = p_branch_id or o.return_branch_id = p_branch_id)
    and (
      p_status is null or p_status = 'all'
      or (p_status = 'completed' and o.completed_at is not null)
      or (p_status = 'cancelled' and o.cancelled_at is not null)
      or (p_status = o.status::text and o.completed_at is null and o.cancelled_at is null)
      or p_status not in (
        'completed', 'cancelled', 'tiep_nhan_yeu_cau', 'bao_gia', 'chot_don',
        'ky_hop_dong_thu_coc', 'chuan_bi', 'giao_hang_ban_giao',
        'van_hanh_xu_ly_su_co', 'thu_hoi', 'nghiem_thu', 'nhap_kho_bao_tri'
      )
    )
    and (p_range_start is null or o.order_date >= p_range_start)
    and (p_range_end is null or o.order_date <= p_range_end)
    and (
      p_search is null or p_search = ''
      or o.order_code ilike '%' || p_search || '%'
      or c.name ilike '%' || p_search || '%'
    )
    and (
      not p_unpaid_only
      or (o.cancelled_at is null
          and o.delivered_at is not null
          and greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) > 0)
    )
),
sorted as (
  select * from base
  order by
    case when p_sort = 'rental_start_at' and p_dir = 'asc' then rental_start_at end asc nulls first,
    case when p_sort = 'rental_start_at' and p_dir = 'desc' then rental_start_at end desc nulls last,
    case when p_sort = 'rental_end_at' and p_dir = 'asc' then rental_end_at end asc nulls first,
    case when p_sort = 'rental_end_at' and p_dir = 'desc' then rental_end_at end desc nulls last,
    case when p_sort = 'customer' and p_dir = 'asc' then customer_name end asc,
    case when p_sort = 'customer' and p_dir = 'desc' then customer_name end desc,
    case when p_sort = 'total_value' and p_dir = 'asc' then total_value end asc,
    case when p_sort = 'total_value' and p_dir = 'desc' then total_value end desc,
    case when p_sort = 'status' and p_dir = 'asc' then status_rank end asc,
    case when p_sort = 'status' and p_dir = 'desc' then status_rank end desc,
    case when p_sort is null
      or p_sort not in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then order_date end desc,
    case when p_sort is null
      or p_sort not in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then id end desc,
    case when p_sort is not null
      and p_sort in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then id end asc
)
select jsonb_build_object(
  'totalCount', (select count(*) from base),
  'stats', (
    select jsonb_build_object(
      'totalRevenue', coalesce(sum(vat_total) filter (where cancelled_at is null and delivered_at is not null), 0),
      -- PHẢI THU cùng mốc doanh số: chỉ đơn ĐÃ GIAO (CEO 2026-09-02 — đơn
      -- đặt trước khách còn đổi ý được, chưa phải nợ).
      'vatRevenue', coalesce(sum(vat_total) filter (where cancelled_at is null and delivered_at is not null), 0),
      'deliveredUnpaidAmount', coalesce(sum(remaining) filter (where cancelled_at is null and delivered_at is not null and remaining > 0), 0),
      'completedCount', count(*) filter (where cancelled_at is null and completed_at is not null),
      'cancelledCount', count(*) filter (where cancelled_at is not null),
      'unpaidCount', count(*) filter (where cancelled_at is null and delivered_at is not null and remaining > 0),
      'unpaidAmount', coalesce(sum(remaining) filter (where cancelled_at is null and delivered_at is not null and remaining > 0), 0)
    ) from base
  ),
  'rows', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select id, order_code, pickup_branch_id, return_branch_id, customer_id, customer_name,
             rental_start_at, rental_end_at, total_value, status, order_date, completed_at, cancelled_at
      from sorted
      limit greatest(p_page_size, 1)
      offset greatest(p_page - 1, 0) * greatest(p_page_size, 1)
    ) t
  )
);
$$;

-- ============ 3. customer_page_report: total_owed chỉ đơn đã giao ============
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
  select id, customer_id, total_value, order_date, pickup_branch_id, return_branch_id,
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
