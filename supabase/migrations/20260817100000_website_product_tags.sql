-- Tags cho sản phẩm web (CEO 2026-08-17): tìm chéo theo thông số — "13
-- inch", "M1 Pro", "Thunderbolt 4"... Hiện thành chip trên trang sản phẩm,
-- bấm chip = tìm kiếm mọi sản phẩm cùng tag; ô tìm kiếm cũng khớp tags.
-- Nội dung tags: script auto-tags bóc từ tên + mô tả, CRM sửa tay được.

alter table public.website_products
  add column if not exists tags text[] not null default '{}';

-- Thêm tags vào CUỐI view (create or replace giữ thứ tự cột cũ).
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
  wp.tags
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.product_type = 'rental';
