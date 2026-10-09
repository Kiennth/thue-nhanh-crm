-- B9 (Grok CRM 09/10): "Đã gồm gì" + FAQ riêng theo sản phẩm, FAQ chung theo
-- danh mục (web dùng khi sản phẩm chưa có FAQ riêng). jsonb thay cho bảng
-- product_faqs/category_faqs của Grok — cùng kiểu với spec_facets/image_alts.
--   included_items = ["1 × MacBook Air M3 13 inch", "Sạc 35W + cáp USB-C", …]  (≤ 5 dòng)
--   faqs           = [{ "q": "…", "a": "…" }, …]                                   (≤ 3 câu)
-- Dòng chung "Kiểm tra máy cùng nhân viên khi giao và khi trả" web tự thêm.
alter table public.website_products
  add column if not exists included_items jsonb not null default '[]'::jsonb,
  add column if not exists faqs jsonb not null default '[]'::jsonb;
alter table public.website_products
  drop constraint if exists website_products_included_items_max5,
  drop constraint if exists website_products_faqs_max3;
alter table public.website_products
  add constraint website_products_included_items_max5
    check (jsonb_typeof(included_items) = 'array' and jsonb_array_length(included_items) <= 5),
  add constraint website_products_faqs_max3
    check (jsonb_typeof(faqs) = 'array' and jsonb_array_length(faqs) <= 3);

alter table public.website_categories
  add column if not exists faqs jsonb not null default '[]'::jsonb;
alter table public.website_categories
  drop constraint if exists website_categories_faqs_max3;
alter table public.website_categories
  add constraint website_categories_faqs_max3
    check (jsonb_typeof(faqs) = 'array' and jsonb_array_length(faqs) <= 3);

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
  wp.image_alts,
  wp.included_items,
  wp.faqs
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.discontinued_at is null
  and et.product_type = any (array['rental'::product_type, 'sale'::product_type]);

create or replace view public.website_categories_public
  with (security_invoker = off) as
select
  wc.slug,
  wc.name,
  coalesce(wc.name_en, wc.name) as name_en,
  wc.seo_title,
  wc.seo_title_en,
  wc.seo_description,
  wc.seo_description_en,
  wc.intro_html,
  wc.intro_html_en,
  wc.hero_image_url,
  wc.sort_order,
  (
    select count(*)
    from public.website_products wp
    join public.equipment_types et on et.id = wp.equipment_type_id
    where wp.website_category_id = wc.id
      and wp.is_published
      and et.discontinued_at is null
      and et.product_type = 'rental'
  ) as product_count,
  parent.slug as parent_slug,
  wc.h1,
  wc.h1_en,
  wc.faqs
from public.website_categories wc
left join public.website_categories parent
  on parent.id = wc.parent_id and parent.is_published
where wc.is_published;

notify pgrst, 'reload schema';
