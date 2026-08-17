-- Phí giao tận nơi theo TỪNG sản phẩm web (CEO 2026-08-17: "tao qui định
-- sẵn, cái nào ship bao tiền"). null = chưa đặt → web hiện "phí giao báo
-- khi xác nhận"; có giá trị → khách chọn Giao tận nơi là cộng thẳng vào
-- tạm tính + ghi vào tin nhắn Zalo.

alter table public.website_products
  add column if not exists ship_fee numeric(14,2) check (ship_fee >= 0);

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
  et.deposit_amount,
  wc.slug as category_slug,
  wc.name as category_name,
  wp.is_featured,
  wp.sort_order,
  wp.updated_at,
  wp.tags,
  (
    select coalesce(array_agg(rp.slug order by array_position(wp.related_product_ids, rp.id)), '{}')
    from public.website_products rp
    where rp.id = any(wp.related_product_ids) and rp.is_published
  ) as related_slugs,
  wp.ship_fee
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.product_type = 'rental';
