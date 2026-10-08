-- Ghi chép dữ liệu (CEO 2026-10-08, đã áp qua REST — chạy lại không sao).
-- Bộ đàm: trên 100 cái mới cần ô tô → ship_bike_max_qty = 100 (trước null = ngưỡng mặc định).
update public.website_products set ship_bike_max_qty = 100
where slug in ('thue-bo-dam-xiaomi', 'thue-bo-dam-motorola');
