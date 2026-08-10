-- ---------------------------------------------------------------------
-- Sổ đòi nợ theo tuổi nợ (CEO chọn làm 2026-08-09): trang /debts cho
-- Giám đốc/Admin/Kế toán — nợ càng già càng khó đòi, cần thấy ngay ai
-- đang ôm nợ lâu nhất và lần gọi đòi gần nhất nói gì.
--
-- 1. debt_notes — nhật ký đòi nợ per khách (gọi ngày nào, khách hẹn gì).
--    Append-only như sổ ghi chép: không update; xoá chỉ Giám đốc (ghi
--    nhầm). Ghi/đọc: Giám đốc/Admin/Kế toán.
-- 2. RPC debt_aging_report — jsonb {totals, rows}: totals cộng trên TOÀN
--    BỘ khách còn nợ (bản đầu trả table bị PostgREST cắt 1000 dòng →
--    tổng thiếu — hệ thống thực tế có >1000 khách còn nợ, phần lớn là
--    nợ import từ Booqable không kèm lịch sử thanh toán); rows chỉ trả
--    300 khách nợ GIÀ nhất (bảng dài hơn không ai dùng nổi). Tuổi nợ
--    theo order_date của TỪNG ĐƠN còn thiếu: <=30/31-60/61-90/>90 ngày.
--    Quy tắc công nợ toàn hệ thống: mọi đơn chưa huỷ (kể cả hoàn tất),
--    nền giá gồm VAT, trừ mọi thanh toán đã ghi. Loại khách gian lận.
-- ---------------------------------------------------------------------

create table public.debt_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create index debt_notes_customer_id_idx on public.debt_notes(customer_id, created_at desc);

alter table public.debt_notes enable row level security;

create policy "debt_notes_select_manage" on public.debt_notes
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "debt_notes_insert_manage" on public.debt_notes
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "debt_notes_delete_giam_doc" on public.debt_notes
  for delete to authenticated using (public.auth_role() = 'giam_doc');

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
