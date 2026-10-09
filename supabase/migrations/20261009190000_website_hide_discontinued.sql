-- Dừng kinh doanh thì ẩn khỏi web (CEO 2026-10-09 "dừng kinh doanh thì ẩn
-- khỏi web"): view công khai bỏ mã có equipment_types.discontinued_at — trang
-- sản phẩm, danh mục, sản phẩm liên quan, sitemap, giỏ hàng đều đọc từ đây.
-- Không đổi website_products.is_published nên mở lại kinh doanh là web hiện
-- lại như cũ. Số SP trên danh mục cũng trừ mã đã dừng.
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
  et.deposit_negotiable
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
  wc.h1_en
from public.website_categories wc
left join public.website_categories parent
  on parent.id = wc.parent_id and parent.is_published
where wc.is_published;

notify pgrst, 'reload schema';
