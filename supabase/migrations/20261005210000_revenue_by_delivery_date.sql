-- Doanh số ghi vào NGÀY GIAO HÀNG (CEO 2026-10-05), không phải ngày tạo
-- đơn: quy tắc 2026-09-02 chỉ lọc đơn đã giao (delivered_at) nhưng vẫn xếp kỳ
-- theo order_date — đơn đặt từ tháng trước giao hôm nay bị cộng ngược vào kỳ
-- cũ, doanh số tuần đang chạy thấp bất thường. Sửa 3 hàm báo cáo; phía JS
-- (orders-overview, trang chủ, chi nhánh, thưởng, doanh thu thiết bị) đổi
-- cùng commit.

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
    -- Đơn đã giao lọc theo NGÀY GIAO (giờ VN), chưa giao theo ngày tạo đơn —
    -- "Tổng doanh số" của khoảng = đơn GIAO trong khoảng (CEO 2026-10-05).
    and (p_range_start is null or coalesce((o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date, o.order_date) >= p_range_start)
    and (p_range_end is null or coalesce((o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date, o.order_date) <= p_range_end)
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

create or replace function public.equipment_page_report(
  p_branch_id uuid default null,
  p_start date default null,
  p_end date default null
)
returns table (
  equipment_type_id uuid,
  revenue numeric,
  rental_count int,
  current_stock_qty numeric,
  current_inventory_value numeric,
  purchase_cost numeric,
  disposal_proceeds numeric,
  profit numeric,
  profit_ratio numeric
)
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
unit_cost as (
  select equipment_unit_id,
         sum(quantity * unit_cost) / nullif(sum(quantity), 0) as avg_cost,
         sum(quantity * unit_cost) as purchase_cost
  from public.equipment_purchases
  group by equipment_unit_id
),
unit_disposal as (
  select equipment_unit_id, sum(quantity * unit_price) as disposal_proceeds
  from public.equipment_disposals
  group by equipment_unit_id
),
unit_stock as (
  select equipment_unit_id, sum(quantity_total) as qty
  from public.equipment_stock
  where (select branch_id from effective) is null or branch_id = (select branch_id from effective)
  group by equipment_unit_id
),
unit_agg as (
  select
    u.equipment_type_id,
    coalesce(sum(uc.purchase_cost), 0) as purchase_cost,
    coalesce(sum(ud.disposal_proceeds), 0) as disposal_proceeds,
    coalesce(sum(us.qty), 0) as qty,
    coalesce(sum(us.qty * coalesce(uc.avg_cost, 0)), 0) as inventory_value
  from public.equipment_units u
  left join unit_cost uc on uc.equipment_unit_id = u.id
  left join unit_disposal ud on ud.equipment_unit_id = u.id
  left join unit_stock us on us.equipment_unit_id = u.id
  group by u.equipment_type_id
),
instance_agg as (
  select
    i.equipment_type_id,
    coalesce(sum(i.purchase_price), 0) as purchase_cost,
    coalesce(sum(case when i.status = 'disposed' then i.disposal_price else 0 end), 0) as disposal_proceeds,
    count(*) filter (where i.status <> 'disposed') as qty,
    coalesce(sum(case when i.status <> 'disposed' then i.purchase_price else 0 end), 0) as inventory_value
  from public.equipment_instances i
  join public.equipment_types t on t.id = i.equipment_type_id and t.tracking_type = 'individual'
  where (select branch_id from effective) is null or i.branch_id = (select branch_id from effective)
  group by i.equipment_type_id
),
scoped_orders as (
  select id from public.orders
  where cancelled_at is null
    and delivered_at is not null
    -- Theo NGÀY GIAO giờ VN (CEO 2026-10-05).
    and (p_start is null or (delivered_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_start)
    and (p_end is null or (delivered_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_end)
    and (
      (select branch_id from effective) is null
      or pickup_branch_id = (select branch_id from effective)
      or return_branch_id = (select branch_id from effective)
    )
),
revenue_agg as (
  select oe.equipment_type_id, sum(oe.line_total) as revenue, count(*) as rental_count
  from public.order_equipment oe
  where oe.equipment_type_id is not null
    and oe.order_id in (select id from scoped_orders)
  group by oe.equipment_type_id
)
select
  t.id as equipment_type_id,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.rental_count, 0)::int as rental_count,
  coalesce(ua.qty, 0) + coalesce(ia.qty, 0) as current_stock_qty,
  coalesce(ua.inventory_value, 0) + coalesce(ia.inventory_value, 0) as current_inventory_value,
  coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0) as purchase_cost,
  coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0) as disposal_proceeds,
  coalesce(r.revenue, 0) + coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0)
    - (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0)) as profit,
  case
    when (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0)) > 0
    then (coalesce(r.revenue, 0) + coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0))
         / (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0))
    else null
  end as profit_ratio
from public.equipment_types t
left join unit_agg ua on ua.equipment_type_id = t.id
left join instance_agg ia on ia.equipment_type_id = t.id
left join revenue_agg r on r.equipment_type_id = t.id;
$$;
