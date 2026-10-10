-- "Không phải trùng" (CEO 10/10: ĐH FPT và ĐH FPT – Trung tâm Liên kết Quốc
-- tế cùng MST nhưng là 2 phòng ban = 2 khách): nhóm trùng SĐT / MST đã xác
-- nhận là khách khác nhau thì ẩn khỏi Dữ liệu khách cần sửa.
create table if not exists public.customer_dup_ignores (
  kind text not null check (kind in ('dup_phone', 'dup_tax')),
  key text not null,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table public.customer_dup_ignores enable row level security;
drop policy if exists customer_dup_ignores_read on public.customer_dup_ignores;
create policy customer_dup_ignores_read on public.customer_dup_ignores for select to authenticated using (true);
drop policy if exists customer_dup_ignores_write on public.customer_dup_ignores;
create policy customer_dup_ignores_write on public.customer_dup_ignores for all to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active and e.role in ('giam_doc', 'admin', 'ke_toan')))
  with check (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active and e.role in ('giam_doc', 'admin', 'ke_toan')));

-- FPT: 2 phòng ban, CEO xác nhận 10/10.
insert into public.customer_dup_ignores (kind, key, note)
values ('dup_tax', '0102100740', 'ĐH FPT và Trung tâm Liên kết Quốc tế — 2 phòng ban (CEO 10/10)')
on conflict do nothing;

create or replace function public.customer_quality(p_kind text default 'no_tax', p_limit int default 100)
returns jsonb
language sql
stable
set search_path = public
as $$
with c as (
  select cu.*,
    regexp_replace(regexp_replace(coalesce(cu.phone, ''), '[\s.\-()]', '', 'g'), '^(\+84|84(?=\d{9}$))', '0') as phone_n,
    regexp_replace(coalesce(cu.tax_code, ''), '[\s.]', '', 'g') as tax_n
  from public.customers cu
  where cu.id <> 'bf06492c-1b72-460d-974b-30a7e832b3db'
),
stats as (
  select o.customer_id, count(*) as order_count, max(o.created_at) as last_order_at
  from public.orders o where o.cancelled_at is null group by 1
),
flags as (
  select c.*,
    c.customer_type = 'company' and c.tax_n = '' as no_tax,
    c.wants_vat and coalesce(nullif(trim(c.invoice_email), ''), nullif(trim(c.email), '')) is null as no_invoice_email,
    c.phone_n <> '' and c.phone_n !~ '^0\d{9}$' as bad_phone,
    c.wants_vat and coalesce(trim(c.address), '') = '' as no_address,
    c.needs_review as review_flag
  from c
),
dup_phone as (
  select phone_n as k from c where phone_n ~ '^0\d{9}$'
    and phone_n not in (select key from public.customer_dup_ignores where kind = 'dup_phone')
  group by 1 having count(*) > 1
),
dup_tax as (
  select tax_n as k from c where tax_n ~ '^\d{10}(-\d{3})?$'
    and tax_n not in (select key from public.customer_dup_ignores where kind = 'dup_tax')
  group by 1 having count(*) > 1
),
row_of as (
  select f.id, jsonb_build_object(
    'id', f.id, 'name', f.name, 'customer_type', f.customer_type, 'phone', f.phone, 'email', f.email,
    'tax_code', f.tax_code, 'address', f.address, 'contact_name', f.contact_name, 'wants_vat', f.wants_vat,
    'invoice_email', f.invoice_email, 'notes', f.notes, 'deposit_percentage', f.deposit_percentage,
    'representative_name', f.representative_name, 'representative_title', f.representative_title,
    'bank_account_number', f.bank_account_number, 'bank_name', f.bank_name, 'budget_unit_code', f.budget_unit_code,
    'created_at', f.created_at,
    'order_count', coalesce(s.order_count, 0), 'last_order_at', s.last_order_at
  ) as j,
  s.last_order_at, f.created_at, f.phone_n, f.tax_n,
  f.no_tax, f.no_invoice_email, f.bad_phone, f.no_address, f.review_flag
  from flags f left join stats s on s.customer_id = f.id
)
select jsonb_build_object(
  'counts', jsonb_build_object(
    'no_tax', (select count(*) from flags where no_tax),
    'no_invoice_email', (select count(*) from flags where no_invoice_email),
    'bad_phone', (select count(*) from flags where bad_phone),
    'no_address', (select count(*) from flags where no_address),
    'needs_review', (select count(*) from flags where review_flag),
    'dup_phone', (select count(*) from dup_phone),
    'dup_tax', (select count(*) from dup_tax)
  ),
  'rows', case
    when p_kind in ('dup_phone', 'dup_tax') then (
      select coalesce(jsonb_agg(g.j order by g.last_at desc nulls last), '[]'::jsonb) from (
        select r.k, max(r.last_order_at) as last_at,
               jsonb_build_object('key', r.k, 'customers',
                 jsonb_agg(r.j order by r.last_order_at desc nulls last, r.created_at)) as j
        from (
          select ro.*, case when p_kind = 'dup_phone' then ro.phone_n else ro.tax_n end as k
          from row_of ro
        ) r
        where r.k in (select k from dup_phone where p_kind = 'dup_phone'
                      union all select k from dup_tax where p_kind = 'dup_tax')
        group by r.k
        order by max(r.last_order_at) desc nulls last
        limit p_limit
      ) g
    )
    else (
      select coalesce(jsonb_agg(x.j order by x.last_order_at desc nulls last, x.created_at desc), '[]'::jsonb) from (
        select * from row_of ro
        where (p_kind = 'no_tax' and ro.no_tax)
           or (p_kind = 'no_invoice_email' and ro.no_invoice_email)
           or (p_kind = 'bad_phone' and ro.bad_phone)
           or (p_kind = 'no_address' and ro.no_address)
           or (p_kind = 'needs_review' and ro.review_flag)
        order by ro.last_order_at desc nulls last, ro.created_at desc
        limit p_limit
      ) x
    )
  end
);
$$;

notify pgrst, 'reload schema';
