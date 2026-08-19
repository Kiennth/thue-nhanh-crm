-- Mô hình phí ship theo PHƯƠNG TIỆN (CEO 2026-08-19, tiếp nối
-- 20260817130000_website_ship_fee.sql treo từ hôm trước):
-- xe máy 75k đi + 75k về, quá ngưỡng số lượng phải đổi ô tô 200k đi + 200k
-- về. Ngưỡng khai theo TỪNG sản phẩm (đơn vị: số lượng xe máy chở tối đa
-- trước khi phải đổi ô tô):
--   NULL  = dùng mặc định toàn site (5, cấu hình ở site-config.ts bên web)
--   0     = LUÔN ô tô ngay từ cái đầu tiên (đồ cồng kềnh: màn 86-100 inch,
--           dàn photobooth...)
--   số lớn (vd 999) = KHÔNG BAO GIỜ cần ô tô (điện thoại — CEO: "không
--           ngưỡng")
--   số cụ thể = ngưỡng riêng (laptop 5, cột phân làn inox 10...)
-- ship_fee (cột cũ, phí cố định thủ công) vẫn ưu tiên cao nhất nếu CEO đặt
-- riêng cho sản phẩm nào đó (vd giấy in ảnh ship_fee=0 = miễn phí ship).
-- Đơn giá 75k/200k là GIÁ CHUẨN NỘI THÀNH — web ghi chú xa hơn có thể phát
-- sinh thêm, xác nhận qua Zalo (chưa làm bảng giá theo khu vực).

-- LƯU Ý: view sống hiện tại (sau migration 20260818000000_website_sale_products.sql)
-- KHÁC bản gốc 20260816000000 — có thêm cột et.product_type ở cuối và lọc
-- cả rental+sale (không chỉ rental). Bản dưới đây khớp ĐÚNG những gì đã
-- chạy thật trên production (lấy từ pg_get_viewdef trước khi thay), thêm
-- ship_bike_max_qty vào SAU CÙNG — CREATE OR REPLACE VIEW không cho đổi
-- thứ tự/tên cột giữa chừng, chỉ được nối thêm cột mới ở cuối.

alter table public.website_products
  add column if not exists ship_bike_max_qty integer check (ship_bike_max_qty >= 0);

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
  wp.ship_bike_max_qty
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.product_type = any (array['rental'::product_type, 'sale'::product_type]);
