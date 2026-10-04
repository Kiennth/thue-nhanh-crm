-- Khách đồng ý báo giá online (CEO 2026-10-04): link /q/<mã ký> → khách gõ
-- tên + bấm Đồng ý. Lưu lúc đồng ý, tên người đồng ý và tổng tiền (gồm VAT)
-- tại thời điểm đó — đơn bị sửa giá sau khi đồng ý thì trang đơn cảnh báo.
alter table public.orders
  add column if not exists quote_accepted_at timestamptz,
  add column if not exists quote_accepted_name text,
  add column if not exists quote_accepted_total numeric(14, 2);
