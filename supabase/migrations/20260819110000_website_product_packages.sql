-- Bộ chọn GÓI GIÁ CỐ ĐỊNH cho sản phẩm dạng dịch vụ trọn gói (CEO
-- 2026-08-19: "Photo Booth Classic và Photo Booth AI sử dụng bảng giá
-- khác, giá cố định theo 4 sản phẩm con"). CRM nội bộ đã đúng từ trước
-- (equipment_units.price ghi đè equipment_types.price khi nhân viên chọn
-- biến thể, xem migration 20260804720000_equipment_unit_price.sql) —
-- lỗ hổng nằm ở web công khai: trang sản phẩm chỉ hiện 1 giá + máy tính
-- theo NGÀY (nếu khách chọn "2 ngày" giá sẽ nhân đôi sai, vì đây là gói
-- dịch vụ trọn gói theo giờ chứ không phải thuê nhiều ngày).
--
-- View mới phơi các biến thể CÓ GIÁ RIÊNG (equipment_units.price not null)
-- ra cho web — sản phẩm nào có ít nhất 1 dòng ở đây thì web hiện BỘ CHỌN
-- GÓI (giá cố định, không nhân theo thời gian) thay cho máy tính giá theo
-- ngày thông thường.

create or replace view public.website_product_packages_public
  with (security_invoker = off) as
select
  wp.slug as product_slug,
  eu.id as unit_id,
  eu.brand_model as label,
  eu.price as price
from public.equipment_units eu
join public.equipment_types et on et.id = eu.equipment_type_id
join public.website_products wp on wp.equipment_type_id = et.id
where wp.is_published
  and eu.price is not null;

grant select on public.website_product_packages_public to anon, authenticated;
