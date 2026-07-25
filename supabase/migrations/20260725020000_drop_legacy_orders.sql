-- Toàn bộ lịch sử đơn hàng từ Booqable (2021 đến nay) giờ đã nằm thẳng trong
-- bảng orders sống (xem scripts/import-booqable-orders.mjs) — bảng tham
-- chiếu legacy_orders không còn cần thiết nữa.
drop table if exists public.legacy_orders;
