-- Giai đoạn 3 (Grok tách gọn CRM 10/10): cảnh báo có lý do khi chốt khâu.
-- step_overrides lưu lý do người làm nhập khi vẫn tiếp tục dù cảnh báo (vd
-- Nghiệm thu / Nhập kho khi khách còn nợ hoặc chưa thu cọc) — hiện ở Hôm nay,
-- cột "Cần chú ý" và trang đơn. Đồng thời sửa "đã thu" ở danh sách đơn / Hôm
-- nay chỉ tính khoản thanh toán HOÁ ĐƠN (thu/hoàn cọc là tiền giữ hộ) — khớp
-- trang chi tiết đơn.
create table if not exists public.step_overrides (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  task_type public.task_type not null,
  rule text not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  detail text,
  employee_id uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists step_overrides_order_idx on public.step_overrides (order_id, created_at desc);
alter table public.step_overrides enable row level security;
drop policy if exists step_overrides_read on public.step_overrides;
create policy step_overrides_read on public.step_overrides for select to authenticated using (true);
drop policy if exists step_overrides_insert on public.step_overrides;
create policy step_overrides_insert on public.step_overrides for insert to authenticated
  with check (employee_id = public.auth_employee_id());

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
  -- Chỉ khoản thanh toán hoá đơn — thu/hoàn cọc là tiền giữ hộ (như trang đơn).
  select order_id, sum(amount) as amt from public.order_payments where payment_type = 'invoice' group by 1
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
               and not s.invoice_not_needed) as invoice_pending,
             (select so.reason from public.step_overrides so where so.order_id = s.id
              order by so.created_at desc limit 1) as override_reason
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



create or replace function public.orders_view_counts(p_branch_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
with paid as (
  -- Chỉ khoản thanh toán hoá đơn — thu/hoàn cọc là tiền giữ hộ (như trang đơn).
  select order_id, sum(amount) as amt from public.order_payments where payment_type = 'invoice' group by 1
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


create or replace function public.today_board(
  p_branch_id uuid default null,
  p_employee_id uuid default null,
  p_limit int default 5
)
returns jsonb
language sql
stable
set search_path = public
as $$
with d as (
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d0,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 as d1
),
transport as (
  select * from (values
    ('38f5c644-3898-4b1f-a3f5-901e55f77c6a'::uuid, 'delivery'),
    ('ce4a5f88-8daa-47c2-92fc-196d1fc321db'::uuid, 'delivery'),
    ('13c85fe0-8b13-4d76-9df5-a20b19598cc9'::uuid, 'collection'),
    ('1a53924a-a070-44b0-9441-3f09042af7e7'::uuid, 'collection')
  ) t(type_id, kind)
),
mine as (
  select o.id from public.orders o where p_employee_id is not null and o.created_by = p_employee_id
  union
  select t.order_id from public.order_tasks t where p_employee_id is not null and t.employee_id = p_employee_id
  union
  select l.order_id from public.order_equipment l where p_employee_id is not null and l.employee_id = p_employee_id
),
base as (
  select o.id, o.order_code, o.status, o.pickup_branch_id, o.return_branch_id,
         o.rental_start_at, o.rental_end_at, o.delivered_at, o.completed_at,
         o.invoice_issued_at, o.invoice_not_needed, o.total_value,
         (o.rental_start_at at time zone 'Asia/Ho_Chi_Minh')::date as start_day,
         (o.rental_end_at at time zone 'Asia/Ho_Chi_Minh')::date as end_day,
         c.name as customer_name
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.cancelled_at is null
    and (p_employee_id is null or o.id in (select id from mine))
),
deliveries as (
  select b.*,
    -- Có dòng phí giao mà chưa ai nhận chạy; không có dòng phí = khách tự lấy.
    exists (select 1 from public.order_equipment l join transport t on t.type_id = l.equipment_type_id
            where l.order_id = b.id and t.kind = 'delivery' and l.employee_id is null) as no_driver,
    not exists (select 1 from public.order_equipment l join transport t on t.type_id = l.equipment_type_id
                where l.order_id = b.id and t.kind = 'delivery') as self_pickup,
    -- Máy theo serial chưa gán máy (gán lúc giao — CEO 05/10).
    exists (select 1 from public.order_equipment l join public.equipment_types et on et.id = l.equipment_type_id
            where l.order_id = b.id and et.product_type = 'rental' and et.tracking_type = 'individual'
              and l.equipment_instance_id is null) as no_serial
  from base b, d
  where b.start_day in (d.d0, d.d1)
    and (p_branch_id is null or b.pickup_branch_id = p_branch_id)
),
returns_ as (
  select b.*,
    exists (select 1 from public.order_equipment l join transport t on t.type_id = l.equipment_type_id
            where l.order_id = b.id and t.kind = 'collection' and l.employee_id is null) as no_collector
  from base b, d
  where b.end_day in (d.d0, d.d1) and b.completed_at is null
    and (p_branch_id is null or b.return_branch_id = p_branch_id)
),
overdue as (
  select b.* from base b
  where b.completed_at is null and b.delivered_at is not null and b.rental_end_at < now()
    and b.status in ('giao_hang_ban_giao', 'van_hanh_xu_ly_su_co', 'thu_hoi')
    and (p_branch_id is null or b.pickup_branch_id = p_branch_id or b.return_branch_id = p_branch_id)
),
paid as (
  select p.order_id, sum(p.amount) as amt from public.order_payments p
  where p.payment_type = 'invoice' and p.order_id in (select id from base where completed_at >= now() - interval '30 days' and order_code like 'PO%')
  group by 1
),
owing as (
  select b.*, greatest(0, round(b.total_value * 1.08) - coalesce(pd.amt, 0)) as remaining
  from base b left join paid pd on pd.order_id = b.id
  where b.completed_at >= now() - interval '30 days' and b.completed_at <= now()
    and b.order_code like 'PO%'
    and round(b.total_value * 1.08) - coalesce(pd.amt, 0) >= 1000
    and (p_branch_id is null or b.pickup_branch_id = p_branch_id or b.return_branch_id = p_branch_id)
),
invoice_late as (
  -- Sổ hoá đơn đỏ tính từ mốc 01/10/2026 (đơn cũ đã đánh "đã xuất" hàng loạt).
  select b.* from base b
  where b.completed_at is not null and b.completed_at >= '2026-10-01'
    and b.completed_at < now() - interval '2 days'
    and b.invoice_issued_at is null and not b.invoice_not_needed
    and (p_branch_id is null or b.pickup_branch_id = p_branch_id or b.return_branch_id = p_branch_id)
)
select jsonb_build_object(
  'today', (select d0 from d),
  'counts', jsonb_build_object(
    'deliverToday', (select count(*) from deliveries, d where start_day = d.d0),
    'deliverTomorrow', (select count(*) from deliveries, d where start_day = d.d1),
    'deliverNoDriver', (select count(*) from deliveries where no_driver and delivered_at is null),
    'returnToday', (select count(*) from returns_, d where end_day = d.d0),
    'returnTomorrow', (select count(*) from returns_, d where end_day = d.d1),
    'returnNoCollector', (select count(*) from returns_ where no_collector),
    'overdue', (select count(*) from overdue),
    'owingCount', (select count(*) from owing),
    'owingAmount', (select coalesce(sum(remaining), 0) from owing),
    'invoiceLate', (select count(*) from invoice_late)
  ),
  'deliveries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, order_code, customer_name, pickup_branch_id as branch_id, rental_start_at as at, status,
           delivered_at is not null as done, no_driver, self_pickup, no_serial
    from deliveries order by rental_start_at, order_code limit p_limit) x),
  'returns', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, order_code, customer_name, return_branch_id as branch_id, rental_end_at as at, status, no_collector
    from returns_ order by rental_end_at, order_code limit p_limit) x),
  'overdue', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, order_code, customer_name, coalesce(return_branch_id, pickup_branch_id) as branch_id,
           rental_end_at as at, status
    -- Mới quá hạn lên đầu: đơn BQ cũ kẹt khâu giao từ 2023–2024 (trễ hàng trăm
    -- ngày) không che mất đơn cần xử lý ngay.
    from overdue order by rental_end_at desc limit p_limit) x),
  'owing', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, order_code, customer_name, pickup_branch_id as branch_id, completed_at as at, remaining,
           (select so.reason from public.step_overrides so where so.order_id = owing.id
            order by so.created_at desc limit 1) as reason
    from owing order by completed_at desc limit p_limit) x)
);
$$;


notify pgrst, 'reload schema';
