-- Form đặt thuê web v2 (gói Grok v2, CEO 2026-10-09):
--   * Một form cho Công ty / dự án | Cá nhân. Bắt buộc: họ tên người liên hệ + SĐT.
--   * Một ô mã số duy nhất (tax_code), bắt buộc với cả 2 (CEO 09/10: "CCCD chính
--     là MST, 2 cái là 1"): khách lẻ nhập số CCCD (12 số; nhận cả CMND 9 số cũ),
--     công ty nhập MST (10 số hoặc 10-3). Công ty bắt buộc thêm tên công ty.
--   * Email không bắt buộc.
--   * Thành phố + Giao tận nơi / Nhận tại điểm nhận (pickup_key như cũ: hcm|hn|dn
--     = nhận tại, 'ship' + ship_city = giao; địa chỉ bắt buộc khi giao).
-- customer_name = họ tên người liên hệ (cả 2 loại); tên pháp nhân ở company_name.

alter table public.website_orders alter column email drop not null;
alter table public.website_orders add column if not exists company_name text;

create or replace function public.website_submit_order(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_type text := coalesce(p->>'customer_type', '');
  v_phone text := trim(coalesce(p->>'phone', ''));
  v_email text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  v_tax text := trim(coalesce(p->>'tax_code', ''));
  v_taxd text := regexp_replace(coalesce(p->>'tax_code', ''), '[^0-9]', '', 'g');
  v_name text := trim(coalesce(p->>'customer_name', ''));
  v_company text := nullif(trim(coalesce(p->>'company_name', '')), '');
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
  if v_type not in ('individual', 'company') then raise exception 'invalid_customer_type'; end if;
  if length(v_name) < 2 or length(v_name) > 200 then raise exception 'invalid_name'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 9 and 12 or length(v_phone) > 20 then
    raise exception 'invalid_phone';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200) then
    raise exception 'invalid_email';
  end if;
  if v_type = 'company' and (v_company is null or length(v_company) < 2 or length(v_company) > 300) then
    raise exception 'invalid_company';
  end if;
  -- Cá nhân: CCCD 12 số (CMND cũ 9 số). Công ty: MST 10 số, chi nhánh 10-3.
  if v_type = 'individual' and length(v_taxd) not in (9, 12) then raise exception 'invalid_id_number'; end if;
  if v_type = 'company' and (v_tax !~ '^[0-9][0-9 -]{7,15}$' or length(v_taxd) not in (10, 13)) then
    raise exception 'invalid_tax_code';
  end if;
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
    code, customer_type, customer_name, company_name, phone, email, tax_code,
    pickup_key, ship_city, address, rental_start_at, rental_end_at, items,
    estimated_total, estimated_ship, estimated_deposit, note, locale
  ) values (
    v_code, v_type, v_name, case when v_type = 'company' then v_company else null end, v_phone, v_email,
    case when v_type = 'individual' then v_taxd else v_tax end, v_pickup, case when v_pickup = 'ship' then v_ship_city else null end, v_address,
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
