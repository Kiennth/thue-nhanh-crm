-- B8 (Grok CRM 09/10, CEO duyệt thứ tự): trạng thái sản phẩm.
--   * "Sắp ra mắt" (is_unreleased + ngày dự kiến tuỳ chọn) là NGUỒN DUY NHẤT
--     của nhãn "Đặt trước" trên web (trước đây web ghi cứng danh sách slug).
--     Đến ngày dự kiến CRM chỉ nhắc, không tự tắt.
--   * "Ngừng kinh doanh" dùng lại discontinued_at (20261009180000) + người bấm.
-- Thuê nhiều / Hàng mới dùng 2 cờ web đang có (website_products.is_featured /
-- is_new), không thêm cột.
alter table public.equipment_types
  add column if not exists is_unreleased boolean not null default false,
  add column if not exists expected_launch_date date,
  add column if not exists discontinued_by uuid references public.employees(id) on delete set null;

-- Đặt trước hiện tại trên web = chỉ iPhone Duo (CEO 2026-10-09).
update public.equipment_types et
set is_unreleased = true
from public.website_products wp
where wp.equipment_type_id = et.id and wp.slug = 'thue-iphone-duo';


-- Web đọc "Đặt trước" từ cột is_unreleased (thêm cuối view, không đổi cột cũ).
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
  et.expected_launch_date
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.discontinued_at is null
  and et.product_type = any (array['rental'::product_type, 'sale'::product_type]);

notify pgrst, 'reload schema';
