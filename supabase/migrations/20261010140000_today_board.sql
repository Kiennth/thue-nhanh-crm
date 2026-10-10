-- Trang "Hôm nay" (Grok tách gọn CRM 10/10, giai đoạn 1): 1 lần gọi trả 6 số
-- đếm + 4 danh sách tối đa p_limit dòng, chỉ trong HÔM NAY + NGÀY MAI (giờ VN)
-- — thay cho khối "Sắp tới / Sắp về" cũ tải mọi đơn tới tận 03/2027.
-- security invoker: RLS orders theo kho của từng vai trò vẫn áp.
--   p_branch_id  : lọc kho (giao theo kho giao, thu hồi theo kho thu hồi)
--   p_employee_id: "Của tôi" — đơn mình tạo / được giao khâu / được giao dòng
-- "Hoàn tất còn nợ" chỉ tính đơn TẠO TRÊN CRM (mã PO…) hoàn tất 30 ngày gần
-- đây: đơn Booqable đồng bộ trạng thái hoàn tất sang nhưng tiền khách trả vẫn
-- nằm ở Booqable (10/10: 276/280 đơn "còn nợ" là BQ) → số ảo.
create index if not exists orders_completed_at_idx on public.orders (completed_at) where cancelled_at is null;

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
  where p.order_id in (select id from base where completed_at >= now() - interval '30 days' and order_code like 'PO%')
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
    from overdue order by rental_end_at limit p_limit) x),
  'owing', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, order_code, customer_name, pickup_branch_id as branch_id, completed_at as at, remaining
    from owing order by completed_at desc limit p_limit) x)
);
$$;

revoke all on function public.today_board(uuid, uuid, int) from public, anon;
grant execute on function public.today_board(uuid, uuid, int) to authenticated;

notify pgrst, 'reload schema';
