-- ---------------------------------------------------------------------
-- CEO chốt 2026-08-08: áp quy tắc "đơn chưa hoàn thành không tính doanh
-- số" cho TOÀN HỆ THỐNG (trước đó mới áp cho customer_page_report, xem
-- 20260808110000). Nguyên tắc thống nhất:
--   - DOANH SỐ/DOANH THU (kể cả lượt thuê đi kèm doanh thu): chỉ đơn có
--     completed_at (đủ 10 khâu) và chưa huỷ.
--   - PHẢI THU (vatRevenue/unpaidAmount, biểu đồ Đã thu/Còn thiếu, công
--     nợ): vẫn tính mọi đơn chưa huỷ — đơn đang chạy khách vẫn nợ thật.
--   - ĐẾM TRẠNG THÁI (Tổng đơn/Đang xử lý/Hoàn tất/Đã huỷ, số đơn của
--     khách trong danh sách): giữ nguyên — đếm sự tồn tại, không phải
--     doanh số.
-- 3 hàm sửa trong migration này: orders_page_list (Tổng doanh số),
-- customer_page_list (cột Tổng doanh số từng khách), equipment_page_report
-- (doanh thu/lượt thuê/lợi nhuận từng loại hàng). Phần JS (trang chủ,
-- orders-overview, equipment-revenue-overview) sửa trong cùng commit.
-- ---------------------------------------------------------------------

-- ============ orders_page_list: totalRevenue chỉ đơn hoàn tất ============
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
    o.completed_at, o.cancelled_at,
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
      -- Doanh số: chỉ đơn hoàn tất (CEO 2026-08-08). Trước đây sum mọi đơn
      -- khớp lọc — kể cả đơn huỷ (bug có sẵn, tiện sửa luôn theo quy tắc mới).
      'totalRevenue', coalesce(sum(total_value) filter (where cancelled_at is null and completed_at is not null), 0),
      -- vatRevenue/unpaidAmount là cặp PHẢI THU cho biểu đồ Đã thu/Còn thiếu
      -- — giữ mọi đơn chưa huỷ (đơn đang chạy khách vẫn nợ thật).
      'vatRevenue', coalesce(sum(vat_total) filter (where cancelled_at is null), 0),
      'completedCount', count(*) filter (where cancelled_at is null and completed_at is not null),
      'cancelledCount', count(*) filter (where cancelled_at is not null),
      'unpaidCount', count(*) filter (where cancelled_at is null and remaining > 0),
      'unpaidAmount', coalesce(sum(remaining) filter (where cancelled_at is null and remaining > 0), 0)
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

-- ==== customer_page_list: cột "Tổng doanh số" chỉ đơn hoàn tất ====
-- "Số lượng đơn" vẫn đếm mọi đơn chưa huỷ (đếm sự tồn tại, không phải
-- doanh số) — điều kiện hiện khách theo chi nhánh cũng giữ nguyên.
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
  select id, customer_id, total_value, (completed_at is not null) as is_completed
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
         coalesce(sum(round(s.total_value * 1.08 * 100) / 100) filter (where s.is_completed), 0)::numeric as total_revenue
  from public.customers c
  left join scoped s on s.customer_id = c.id
  where (p_search is null or p_search = ''
         or c.name ilike '%' || p_search || '%'
         or c.phone ilike '%' || p_search || '%')
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

-- ==== equipment_page_report: doanh thu/lượt thuê chỉ đơn hoàn tất ====
-- Lượt thuê đi cùng doanh thu (cùng revenue_agg) — đơn chưa xong chưa phải
-- 1 lượt thuê hoàn chỉnh, nhất quán với quyết định donut khách hàng.
-- profit/profit_ratio suy từ revenue nên tự khớp theo.
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
    and completed_at is not null
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
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
