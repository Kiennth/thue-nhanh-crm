-- Tiêu đề H1 riêng cho trang danh mục web (CEO 2026-10-08, theo đề xuất SEO
-- "Cho thuê {thiết bị} … tại HCM, Hà Nội"). Trống → web dùng tên danh mục.
-- seo_title / seo_description / intro_html đã có từ 20260816000000.
alter table public.website_categories
  add column if not exists h1 text,
  add column if not exists h1_en text;

-- Thêm h1, h1_en vào CUỐI view (create or replace giữ nguyên thứ tự cột cũ).
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
      and et.product_type = 'rental'
  ) as product_count,
  parent.slug as parent_slug,
  wc.h1,
  wc.h1_en
from public.website_categories wc
left join public.website_categories parent
  on parent.id = wc.parent_id and parent.is_published
where wc.is_published;
