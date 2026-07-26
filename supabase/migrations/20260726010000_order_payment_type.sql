-- Phân biệt thanh toán hoá đơn (thuê/dịch vụ) với thu/hoàn tiền cọc — trước
-- đây order_payments chỉ có 1 loại, "Đã thanh toán" cộng dồn lẫn cả cọc vào
-- hoá đơn là sai vì cọc không tính VAT và là khoản giữ hộ, không phải doanh
-- thu. amount vẫn luôn dương (check (amount > 0) sẵn có) — chiều tiền do
-- payment_type quyết định, không cần số âm.

create type public.order_payment_type as enum ('invoice', 'deposit_collect', 'deposit_refund');

alter table public.order_payments
  add column payment_type public.order_payment_type not null default 'invoice';
