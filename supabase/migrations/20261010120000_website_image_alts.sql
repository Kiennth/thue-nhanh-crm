-- B5 (Grok CRM 09/10): alt tiếng Việt cho từng ảnh sản phẩm web. Lưu theo
-- URL ảnh (đổi thứ tự / xoá ảnh không lệch alt):
--   image_alts = { "<url>": { "alt": "MacBook Air M3 16GB, nhìn từ phía trước", "auto": true } }
-- auto = alt lấy từ nút "Gợi ý" (đổi tên sản phẩm thì CRM gợi ý cập nhật),
-- false = người nhập tự viết (giữ nguyên). Không tự điền hàng loạt.
alter table public.website_products
  add column if not exists image_alts jsonb not null default '{}'::jsonb;
alter table public.website_products
  drop constraint if exists website_products_image_alts_object;
alter table public.website_products
  add constraint website_products_image_alts_object check (jsonb_typeof(image_alts) = 'object');

-- Còn ảnh gallery nào chưa có alt → chip "Thiếu alt ảnh" ở trang Website.
create or replace function public.website_alt_missing(urls text[], alts jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select exists (
    select 1 from unnest(coalesce(urls, '{}')) u
    where coalesce(btrim(alts -> u ->> 'alt'), '') = ''
  )
$$;

alter table public.website_products
  add column if not exists alt_missing boolean
    generated always as (public.website_alt_missing(gallery_image_urls, image_alts)) stored;

create or replace view public.website_products_public
  with (security_invoker = off) as
select
  wp.slug,
  coalesce(wp.name, et.name) as name,
  coalesce(wp.name_en, wp.name, et.name) as name_en,
  wp.short_description,
  wp.short_description_en,
  wp.description_html,
  wp.description_html_en,
  wp.seo_title,
  wp.seo_title_en,
  wp.seo_description,
  wp.seo_description_en,
  wp.brand,
  wp.gallery_image_urls,
  et.image_url as fallback_image_url,
  et.price,
  et.rental_period_unit,
  et.pricing_method,
  et.pricing_template_id,
  case when et.tracking_type = 'combo' then coalesce((
    select sum(c.quantity * coalesce(ct.deposit_amount, 0))
    from public.equipment_type_components c
    join public.equipment_types ct on ct.id = c.component_type_id
    where c.combo_type_id = et.id
  ), 0)::numeric(14,2) else et.deposit_amount end as deposit_amount,
  wc.slug as category_slug,
  wc.name as category_name,
  wp.is_featured,
  wp.sort_order,
  wp.updated_at,
  wp.tags,
  (
    select coalesce(array_agg(rp.slug order by array_position(wp.related_product_ids, rp.id)), '{}')
    from public.website_products rp
    join public.equipment_types rt on rt.id = rp.equipment_type_id
    where rp.id = any(wp.related_product_ids) and rp.is_published
      and rt.discontinued_at is null
  ) as related_slugs,
  wp.ship_fee,
  et.product_type,
  wp.ship_bike_max_qty,
  wp.is_new,
  wp.created_at,
  wp.spec_facets,
  et.deposit_negotiable,
  et.is_unreleased,
  et.expected_launch_date,
  wp.image_alts
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.discontinued_at is null
  and et.product_type = any (array['rental'::product_type, 'sale'::product_type]);

notify pgrst, 'reload schema';
