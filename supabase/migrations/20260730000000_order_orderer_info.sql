-- Thêm thông tin người đặt hàng riêng cho từng đơn (tên/SĐT/email) — độc
-- lập với khách hàng (customers) trên hợp đồng, vì với khách agency, mỗi
-- đơn có thể do một nhân sự khác nhau của agency đó gọi đặt.
alter table public.orders
  add column orderer_name text,
  add column orderer_phone text,
  add column orderer_email text;
