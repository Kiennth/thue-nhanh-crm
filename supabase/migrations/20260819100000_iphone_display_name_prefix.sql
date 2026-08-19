-- Thêm tiền tố "Điện thoại " vào tên hiển thị WEB (không đụng tên nội bộ
-- equipment_types.name) cho toàn bộ 32 sản phẩm trong danh mục iPhone
-- (CEO 2026-08-19: "tất cả sản phẩm iPhone thêm chữ Điện thoại ở đằng
-- trước"), khớp cách đặt tên "Điện thoại Android" đã có. Chỉ đổi
-- website_products.name (tiếng Việt); name_en giữ nguyên "iPhone ..." vì
-- tiếng Anh không cần thêm từ "Phone". Đã áp qua REST service-role.

update public.website_products wp
set name = 'Điện thoại ' || et.name
from public.equipment_types et
where wp.equipment_type_id = et.id
  and wp.website_category_id = (select id from public.website_categories where slug = 'thue-iphone')
  and et.name ilike 'iphone%';
