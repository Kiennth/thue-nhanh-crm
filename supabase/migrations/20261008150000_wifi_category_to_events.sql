-- Ghi chép dữ liệu (CEO 2026-10-08, đã áp qua REST — chạy lại không sao).
-- Danh mục web "Cục phát WiFi & 5G" (thiet-bi-mang) chuyển từ nhóm Máy tính sang
-- Sự kiện & văn phòng; web xếp vào khu "Vận hành sự kiện" (src/lib/category-sections.ts).
update public.website_categories
set parent_id = '4238ab38-462f-4faa-961b-9ab360173de1', sort_order = 12
where id = 'e2a54c0b-9829-4cf8-9084-e4b3f74c9a34';
