-- Giỏ hàng web → "Đơn web" trong CRM (CEO 2026-10-04). Khách thêm hàng vào
-- giỏ trên thuenhanh.vn, chọn thời gian thuê + nhận tại kho/giao tận nơi,
-- điền SĐT/tên/email/MST (không cần tài khoản) rồi gửi. Yêu cầu chỉ nằm chờ
-- ở đây — KHÔNG đụng kho/đơn hàng; nhân viên trực bấm "Lên đơn" trong CRM
-- (popup Tạo đơn nhanh điền sẵn) để thành đơn thật.

create table if not exists public.website_orders (
  id uuid primary key default gen_random_uuid(),
  -- Mã cho khách đọc qua điện thoại: WEB-yymmdd-xxxx
  code text not null unique,
  customer_type text not null check (customer_type in ('individual', 'company')),
  customer_name text not null,
  phone text not null,
  email text not null,
  -- MST công ty, hoặc MST cá nhân / số CCCD
  tax_code text not null,
  -- 'hcm' | 'hn' | 'dn' = nhận tại kho; 'ship' = giao tận nơi (ship_city = kho gần nhất)
  pickup_key text not null check (pickup_key in ('hcm', 'hn', 'dn', 'ship')),
  ship_city text check (ship_city in ('hcm', 'hn', 'dn')),
  address text,
  rental_start_at timestamptz not null,
  rental_end_at timestamptz not null,
  -- [{slug, unit_id, quantity, equipment_type_id, name, variant_label, line_estimate}]
  items jsonb not null,
  -- Giá web TẠM TÍNH lúc khách gửi (nhân viên xác nhận lại).
  estimated_total numeric not null default 0,
  estimated_ship numeric not null default 0,
  estimated_deposit numeric not null default 0,
  note text,
  locale text not null default 'vi',
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  handled_by uuid references public.employees(id) on delete set null,
  staff_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_orders_status_created_idx on public.website_orders (status, created_at desc);
create index if not exists website_orders_phone_created_idx on public.website_orders (phone, created_at desc);

alter table public.website_orders enable row level security;

-- Nhân viên nào cũng xem/xử lý được (người trực có thể là bất kỳ ai).
drop policy if exists "website_orders_select_employees" on public.website_orders;
create policy "website_orders_select_employees" on public.website_orders
  for select to authenticated using (public.is_employee());
drop policy if exists "website_orders_update_employees" on public.website_orders;
create policy "website_orders_update_employees" on public.website_orders
  for update to authenticated using (public.is_employee()) with check (public.is_employee());
drop policy if exists "website_orders_delete_admin" on public.website_orders;
create policy "website_orders_delete_admin" on public.website_orders
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create or replace function public.website_orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists website_orders_touch on public.website_orders;
create trigger website_orders_touch before update on public.website_orders
  for each row execute function public.website_orders_touch_updated_at();

-- Khách (anon) gửi giỏ hàng. security definer: anon không đọc/ghi bảng trực
-- tiếp được, chỉ qua hàm này (kiểm tra dữ liệu + chặn spam). Tên hàng/mã
-- hàng CRM tra lại từ website_products ở đây, không tin dữ liệu khách gửi.
create or replace function public.website_submit_order(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_phone text := trim(coalesce(p->>'phone', ''));
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_tax text := trim(coalesce(p->>'tax_code', ''));
  v_name text := trim(coalesce(p->>'customer_name', ''));
  v_pickup text := coalesce(p->>'pickup_key', '');
  v_ship_city text := nullif(p->>'ship_city', '');
  v_address text := nullif(trim(coalesce(p->>'address', '')), '');
  v_start timestamptz := (p->>'rental_start_at')::timestamptz;
  v_end timestamptz := (p->>'rental_end_at')::timestamptz;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_qty int;
  v_product record;
  v_variant text;
begin
  if length(v_name) < 2 or length(v_name) > 200 then raise exception 'invalid_name'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 9 or length(v_phone) > 20 then
    raise exception 'invalid_phone';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'invalid_email'; end if;
  if v_tax !~ '^[0-9][0-9 -]{7,15}$' then raise exception 'invalid_tax_code'; end if;
  if coalesce(p->>'customer_type', '') not in ('individual', 'company') then raise exception 'invalid_customer_type'; end if;
  if v_pickup not in ('hcm', 'hn', 'dn', 'ship') then raise exception 'invalid_pickup'; end if;
  if v_pickup = 'ship' and (v_address is null or length(v_address) < 5 or v_ship_city not in ('hcm', 'hn', 'dn')) then
    raise exception 'invalid_address';
  end if;
  if v_start is null or v_end is null or v_end <= v_start or v_start < now() - interval '1 day'
     or v_end > now() + interval '2 years' then
    raise exception 'invalid_period';
  end if;
  if length(coalesce(p->>'note', '')) > 2000 or length(coalesce(v_address, '')) > 500 then
    raise exception 'too_long';
  end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') < 1
     or jsonb_array_length(p->'items') > 50 then
    raise exception 'invalid_items';
  end if;

  -- Chặn spam: 1 SĐT tối đa 5 lần / 10 phút; toàn site tối đa 200 / giờ.
  if (select count(*) from public.website_orders
      where phone = v_phone and created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.website_orders where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited';
  end if;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'invalid_quantity'; end if;
    select wp.slug, wp.equipment_type_id, coalesce(wp.name, et.name) as name
      into v_product
      from public.website_products wp
      join public.equipment_types et on et.id = wp.equipment_type_id
      where wp.slug = v_item->>'slug' and wp.is_published;
    if not found then raise exception 'unknown_product'; end if;
    v_variant := null;
    if nullif(v_item->>'unit_id', '') is not null then
      select eu.brand_model into v_variant from public.equipment_units eu
        where eu.id = (v_item->>'unit_id')::uuid and eu.equipment_type_id = v_product.equipment_type_id;
      if not found then raise exception 'unknown_variant'; end if;
    end if;
    v_items := v_items || jsonb_build_object(
      'slug', v_product.slug,
      'equipment_type_id', v_product.equipment_type_id,
      'unit_id', nullif(v_item->>'unit_id', ''),
      'name', v_product.name,
      'variant_label', v_variant,
      'quantity', v_qty,
      'line_estimate', coalesce((v_item->>'line_estimate')::numeric, 0)
    );
  end loop;

  loop
    v_code := 'WEB-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-'
      || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.website_orders where code = v_code);
  end loop;

  insert into public.website_orders (
    code, customer_type, customer_name, phone, email, tax_code, pickup_key, ship_city, address,
    rental_start_at, rental_end_at, items, estimated_total, estimated_ship, estimated_deposit, note, locale
  ) values (
    v_code, p->>'customer_type', v_name, v_phone, v_email, v_tax, v_pickup,
    case when v_pickup = 'ship' then v_ship_city else null end, v_address,
    v_start, v_end, v_items,
    greatest(coalesce((p->>'estimated_total')::numeric, 0), 0),
    greatest(coalesce((p->>'estimated_ship')::numeric, 0), 0),
    greatest(coalesce((p->>'estimated_deposit')::numeric, 0), 0),
    nullif(trim(coalesce(p->>'note', '')), ''),
    case when p->>'locale' = 'en' then 'en' else 'vi' end
  );
  return v_code;
end;
$$;

revoke all on function public.website_submit_order(jsonb) from public;
grant execute on function public.website_submit_order(jsonb) to anon, authenticated;
