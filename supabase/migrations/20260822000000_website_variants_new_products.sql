-- CEO 2026-08-22, 2 yêu cầu cho web công khai new.thuenhanh.vn:
--   1. "Hiện các biến thể ra ngoài website, cho khách hàng lựa chọn dễ hơn"
--      — trước đây web chỉ phơi biến thể CÓ GIÁ RIÊNG (view
--      website_product_packages_public, migration 20260819110000, dùng cho
--      gói Photo Booth). Giờ phơi MỌI biến thể (equipment_units) của sản
--      phẩm đã publish: màu, cỡ, hãng TV, Wi-Fi/5G... — giá riêng (nếu có)
--      vẫn ghi đè giá sản phẩm như cũ, null = dùng giá sản phẩm.
--   2. "Ngoài frontpage cho tao danh mục: Sản phẩm mới" — cờ is_new trên
--      website_products (CEO bật/tắt trong CRM /website như Thuê nhiều
--      nhất), web có dải "Sản phẩm mới" trang chủ + trang /san-pham-moi.
--
-- Áp qua Supabase Dashboard SQL Editor như mọi khi (không có CLI).

-- 1) Cờ "Sản phẩm mới" -----------------------------------------------------
alter table public.website_products
  add column if not exists is_new boolean not null default false;

create index if not exists website_products_new_idx
  on public.website_products (is_new) where is_new;

-- 2) View biến thể: mọi equipment_units của sản phẩm đã publish, TRỪ biến
--    thể mặc định trùng tên sản phẩm (CRM tự tạo ngầm cho hàng quản lý theo
--    số lượng — không phải lựa chọn thật của khách). Web chỉ hiện bộ chọn
--    khi sản phẩm có ≥2 biến thể hoặc có biến thể giá riêng.
create or replace view public.website_product_variants_public
  with (security_invoker = off) as
select
  wp.slug as product_slug,
  eu.id as unit_id,
  eu.brand_model as label,
  eu.price as price,
  eu.image_url as image_url
from public.equipment_units eu
join public.equipment_types et on et.id = eu.equipment_type_id
join public.website_products wp on wp.equipment_type_id = et.id
where wp.is_published
  and eu.brand_model is not null
  and btrim(eu.brand_model) <> ''
  and lower(btrim(eu.brand_model)) <> lower(btrim(et.name));

grant select on public.website_product_variants_public to anon, authenticated;

-- 3) Phơi is_new + created_at ra view sản phẩm — nối vào CUỐI (CREATE OR
--    REPLACE VIEW không cho đổi thứ tự/tên cột cũ). Bản dưới khớp đúng bản
--    đang chạy thật (20260819080000) + 2 cột mới.
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
  wp.ship_fee,
  et.product_type,
  wp.ship_bike_max_qty,
  wp.is_new,
  wp.created_at
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.product_type = any (array['rental'::product_type, 'sale'::product_type]);

-- Giữ nguyên website_product_packages_public (không drop) để bản web đang
-- chạy không hỏng trước khi deploy bản mới; web mới đọc view biến thể.
