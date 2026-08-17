-- Danh mục web 2 TẦNG (CEO 2026-08-17: "18 danh mục phẳng nhiều quá").
-- website_categories thêm parent_id tự tham chiếu: null = nhóm cha (hoặc
-- danh mục đứng một mình), có giá trị = danh mục con. Slug vẫn PHẲNG —
-- URL không đổi (/thue-loa), chỉ cách trình bày menu/sidebar đổi.
-- Sản phẩm vẫn gắn vào danh mục CON như cũ; trang nhóm cha gộp sản phẩm
-- của mọi con (tính ở tầng web, view không đổi cách đếm).

alter table public.website_categories
  add column if not exists parent_id uuid references public.website_categories(id) on delete set null;

create index if not exists website_categories_parent_idx
  on public.website_categories (parent_id);

-- Thêm parent_slug vào CUỐI view (create or replace giữ nguyên thứ tự cột cũ).
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
  parent.slug as parent_slug
from public.website_categories wc
left join public.website_categories parent
  on parent.id = wc.parent_id and parent.is_published
where wc.is_published;
