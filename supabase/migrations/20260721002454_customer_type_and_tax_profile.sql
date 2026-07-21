-- Thêm loại khách hàng (cá nhân/công ty) và hồ sơ thuế — rẻ để thêm sớm,
-- tốn công hơn nếu thêm muộn khi đã có nhiều dữ liệu khách hàng thật.
-- Rút ra từ khảo sát Booqable (xem báo cáo phân tích tính năng theo module).

create type public.customer_type as enum ('individual', 'company');

alter table public.customers
  add column customer_type public.customer_type not null default 'individual',
  add column tax_profile text;
