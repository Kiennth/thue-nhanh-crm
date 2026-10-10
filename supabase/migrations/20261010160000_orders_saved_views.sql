-- Danh sách Đơn hàng giai đoạn 2 (Grok tách gọn CRM 10/10): thêm view lưu sẵn
-- (processing, deliver_soon, return_soon, owing, invoice_pending, completed,
-- all — giữ deliver_today/return_today/overdue cũ), mỗi dòng trả thêm đã thu,
-- còn lại, người tạo đơn (phụ trách) và cờ "Cần chú ý" (chưa gán serial, chưa
-- người giao, chờ hoá đơn). Chữ ký giữ nguyên. Thêm orders_view_counts đếm
-- mọi view 1 lần quét, và bảng saved_views cho view riêng của từng người.
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
  p_unpaid_only boolean default false,
  p_view text default null
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
    o.created_by, o.invoice_issued_at, o.invoice_not_needed,
    coalesce(p.amt, 0) as paid_amount,
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
    -- Chế độ xem nhanh (đề xuất CRM v2 §4.3, CEO 2026-10-09), giờ VN:
    --   deliver_today = ngày nhận hôm nay · return_today = ngày trả hôm nay
    --   overdue = đã giao, quá giờ trả, còn ở khâu chờ thu hồi.
    and (
      p_view is null or p_view = '' or p_view = 'all'
      -- View lưu sẵn (Grok tách gọn CRM 10/10 giai đoạn 2), giờ VN:
      or (p_view = 'processing' and o.cancelled_at is null and o.completed_at is null)
      or (p_view = 'deliver_soon' and o.cancelled_at is null
          and (o.rental_start_at at time zone 'Asia/Ho_Chi_Minh')::date
              between (now() at time zone 'Asia/Ho_Chi_Minh')::date and (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
      or (p_view = 'return_soon' and o.cancelled_at is null and o.completed_at is null
          and (o.rental_end_at at time zone 'Asia/Ho_Chi_Minh')::date
              between (now() at time zone 'Asia/Ho_Chi_Minh')::date and (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
      or (p_view = 'owing' and o.cancelled_at is null and o.delivered_at is not null
          and greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) > 0)
      or (p_view = 'invoice_pending' and o.cancelled_at is null and o.completed_at is not null
          and o.invoice_issued_at is null and not o.invoice_not_needed)
      or (p_view = 'completed' and o.cancelled_at is null and o.completed_at is not null)
      or (p_view = 'deliver_today' and o.cancelled_at is null
          and (o.rental_start_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date)
      or (p_view = 'return_today' and o.cancelled_at is null
          and (o.rental_end_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date)
      or (p_view = 'overdue' and o.cancelled_at is null and o.completed_at is null
          and o.delivered_at is not null and o.rental_end_at < now()
          and o.status in ('giao_hang_ban_giao', 'van_hanh_xu_ly_su_co', 'thu_hoi'))
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
      select s.id, s.order_code, s.pickup_branch_id, s.return_branch_id, s.customer_id, s.customer_name,
             s.rental_start_at, s.rental_end_at, s.total_value, s.status, s.order_date, s.completed_at,
             s.cancelled_at, s.delivered_at, s.paid_amount, s.remaining,
             e.name as owner_name,
             -- Cột "Cần chú ý" (giai đoạn 2): chỉ tính cho dòng của trang này.
             (s.delivered_at is null and s.cancelled_at is null and exists (
               select 1 from public.order_equipment l join public.equipment_types et on et.id = l.equipment_type_id
               where l.order_id = s.id and et.product_type = 'rental' and et.tracking_type = 'individual'
                 and l.equipment_instance_id is null)) as no_serial,
             (s.delivered_at is null and s.cancelled_at is null and exists (
               select 1 from public.order_equipment l
               where l.order_id = s.id and l.employee_id is null
                 and l.equipment_type_id in ('38f5c644-3898-4b1f-a3f5-901e55f77c6a', 'ce4a5f88-8daa-47c2-92fc-196d1fc321db'))) as no_driver,
             (s.completed_at is not null and s.cancelled_at is null and s.invoice_issued_at is null
               and not s.invoice_not_needed) as invoice_pending
      from (
        select * from sorted
        limit greatest(p_page_size, 1)
        offset greatest(p_page - 1, 0) * greatest(p_page_size, 1)
      ) s
      left join public.employees_public e on e.id = s.created_by
    ) t
  )
);
$$;


-- Số đơn của từng view (thanh tab) — 1 lần quét, theo kho đang xem.
create or replace function public.orders_view_counts(p_branch_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
with paid as (
  select order_id, sum(amount) as amt from public.order_payments group by 1
),
b as (
  select o.*, greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) as remaining,
         (o.rental_start_at at time zone 'Asia/Ho_Chi_Minh')::date as sd,
         (o.rental_end_at at time zone 'Asia/Ho_Chi_Minh')::date as ed,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date as d0
  from public.orders o left join paid p on p.order_id = o.id
  where p_branch_id is null or o.pickup_branch_id = p_branch_id or o.return_branch_id = p_branch_id
)
select jsonb_build_object(
  'processing', count(*) filter (where cancelled_at is null and completed_at is null),
  'deliver_soon', count(*) filter (where cancelled_at is null and sd between d0 and d0 + 1),
  'return_soon', count(*) filter (where cancelled_at is null and completed_at is null and ed between d0 and d0 + 1),
  'overdue', count(*) filter (where cancelled_at is null and completed_at is null and delivered_at is not null
                               and rental_end_at < now() and status in ('giao_hang_ban_giao', 'van_hanh_xu_ly_su_co', 'thu_hoi')),
  'owing', count(*) filter (where cancelled_at is null and delivered_at is not null and remaining > 0),
  'invoice_pending', count(*) filter (where cancelled_at is null and completed_at is not null
                                       and invoice_issued_at is null and not invoice_not_needed),
  'completed', count(*) filter (where cancelled_at is null and completed_at is not null),
  'all', count(*)
) from b;
$$;

-- View riêng của từng người: lưu nguyên chuỗi bộ lọc (query string).
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  page text not null default 'orders',
  name text not null check (char_length(name) between 1 and 40),
  query text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists saved_views_employee_idx on public.saved_views (employee_id, page);
alter table public.saved_views enable row level security;
drop policy if exists saved_views_own on public.saved_views;
create policy saved_views_own on public.saved_views
  for all to authenticated
  using (employee_id = public.auth_employee_id())
  with check (employee_id = public.auth_employee_id());

notify pgrst, 'reload schema';
