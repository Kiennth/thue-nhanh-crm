-- Giai đoạn 6 (Grok tách gọn CRM 10/10): chất lượng dữ liệu khách, gộp khách
-- trùng, doanh thu theo nhóm hàng.

-- ============ 1. Hàng đợi chất lượng dữ liệu khách ============
-- Mỗi loại lỗi 1 danh sách (khách có đơn gần đây lên đầu). Sửa xong khách tự
-- rơi khỏi danh sách vì tính lại mỗi lần mở. Loại khách gian lận bỏ qua.
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
  select phone_n as k from c where phone_n ~ '^0\d{9}$' group by 1 having count(*) > 1
),
dup_tax as (
  select tax_n as k from c where tax_n ~ '^\d{10}(-\d{3})?$' group by 1 having count(*) > 1
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

-- ============ 2. Gộp 2 khách trùng ============
-- Chuyển MỌI bảng đang trỏ tới khách bị gộp (tìm theo khoá ngoại — đơn,
-- ghi chú công nợ, đơn cũ… kể cả bảng thêm sau) sang khách giữ lại, điền ô
-- còn trống của khách giữ lại bằng dữ liệu khách bị gộp, rồi xoá khách bị
-- gộp (nhật ký hoạt động lưu bản sao đầy đủ). Chỉ Giám đốc / Admin / Kế toán.
create or replace function public.merge_customers(p_keep uuid, p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  k public.customers%rowtype;
  d public.customers%rowtype;
  fk record;
  v_n int;
  v_moved jsonb := '{}'::jsonb;
begin
  select role into v_role from public.employees where user_id = auth.uid() and is_active;
  if v_role is null or v_role not in ('giam_doc', 'admin', 'ke_toan') then
    raise exception 'Chỉ Giám đốc / Admin / Kế toán được gộp khách.';
  end if;
  if p_keep = p_drop then raise exception 'Hai khách phải khác nhau.'; end if;
  select * into k from public.customers where id = p_keep for update;
  select * into d from public.customers where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'Không tìm thấy khách.'; end if;

  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.customers'::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using p_keep, p_drop;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_moved := v_moved || jsonb_build_object(fk.tbl::text, v_n); end if;
  end loop;

  update public.customers set
    phone = coalesce(nullif(trim(k.phone), ''), d.phone),
    email = coalesce(nullif(trim(k.email), ''), d.email),
    tax_code = coalesce(nullif(trim(k.tax_code), ''), d.tax_code),
    address = coalesce(nullif(trim(k.address), ''), d.address),
    contact_name = coalesce(nullif(trim(k.contact_name), ''), d.contact_name),
    invoice_email = coalesce(nullif(trim(k.invoice_email), ''), d.invoice_email),
    representative_name = coalesce(nullif(trim(k.representative_name), ''), d.representative_name),
    representative_title = coalesce(nullif(trim(k.representative_title), ''), d.representative_title),
    bank_account_number = coalesce(nullif(trim(k.bank_account_number), ''), d.bank_account_number),
    bank_name = coalesce(nullif(trim(k.bank_name), ''), d.bank_name),
    budget_unit_code = coalesce(nullif(trim(k.budget_unit_code), ''), d.budget_unit_code),
    wants_vat = k.wants_vat or d.wants_vat,
    notes = case
      when coalesce(trim(d.notes), '') = '' then k.notes
      when coalesce(trim(k.notes), '') = '' then d.notes
      else k.notes || E'\n' || d.notes end
  where id = p_keep;

  delete from public.customers where id = p_drop;
  return jsonb_build_object('kept', p_keep, 'dropped', p_drop, 'droppedName', d.name, 'moved', v_moved);
end;
$$;

revoke all on function public.merge_customers(uuid, uuid) from anon;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;

-- ============ 3. Doanh thu theo nhóm hàng ============
-- Doanh số = đơn ĐÃ GIAO, gồm VAT, theo NGÀY GIAO (CEO 05/10). Tiền đơn chia
-- về từng dòng theo tỉ lệ thành tiền dòng (đã tính giảm giá cả đơn), cộng theo
-- danh mục của mã hàng; dòng không có danh mục = "Chưa phân loại".
create or replace function public.revenue_by_category(p_from date, p_to date, p_branch_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
with o as (
  select o.id, o.total_value
  from public.orders o
  where o.cancelled_at is null and o.delivered_at is not null
    and (o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    and (p_branch_id is null or o.pickup_branch_id = p_branch_id)
),
l as (
  select l.order_id, l.line_total, et.category_id, l.quantity,
         sum(l.line_total) over (partition by l.order_id) as order_lines
  from public.order_equipment l
  join o on o.id = l.order_id
  left join public.equipment_types et on et.id = l.equipment_type_id
  where l.line_total <> 0
),
shares as (
  select l.category_id, l.quantity,
         case when l.order_lines = 0 then 0 else o.total_value * 1.08 * l.line_total / l.order_lines end as revenue,
         l.order_id
  from l join o on o.id = l.order_id
)
select jsonb_build_object(
  'total', (select coalesce(round(sum(total_value * 1.08)), 0) from o),
  'orders', (select count(*) from o),
  'rows', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
    select s.category_id, coalesce(ec.name, 'Chưa phân loại') as name,
           round(sum(s.revenue)) as revenue, count(distinct s.order_id) as orders, sum(s.quantity) as qty
    from shares s left join public.equipment_categories ec on ec.id = s.category_id
    group by s.category_id, ec.name
  ) x)
);
$$;

notify pgrst, 'reload schema';
