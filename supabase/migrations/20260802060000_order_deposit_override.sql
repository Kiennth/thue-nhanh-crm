-- CEO 2026-08-02: sau khi chuyển "iPad Pro M1 11-inch" (theo số lượng) sang
-- "iPad Pro M1 11-inch (SN)" (serialize, deposit_amount 5tr), 3 đơn đang mở
-- (BQ11746, BQ12070, BQ9119) tự nhiên bị tính cọc dự kiến 5tr dù lúc đặt đơn
-- (dưới mã SP cũ, deposit_amount = 0) khách chưa từng được yêu cầu cọc. Thêm
-- cột override cấp-đơn-hàng để giữ cọc dự kiến = 0 cho riêng 3 đơn này —
-- không đụng % cọc chung của khách hàng (vd 1 khách còn 28 đơn khác đang
-- đúng chính sách cọc 100% mặc định, đổi ở cấp khách sẽ ảnh hưởng nhầm).
alter table public.orders
  add column deposit_override_amount numeric;

update public.orders
set deposit_override_amount = 0
where order_code in ('BQ11746', 'BQ12070', 'BQ9119');
