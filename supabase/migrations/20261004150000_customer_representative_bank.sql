-- Thông tin hợp đồng của khách (CEO 2026-10-04): Người đại diện, Chức vụ, Số
-- tài khoản, Tại ngân hàng — điền sẵn vào phần BÊN B của báo giá/hợp đồng/
-- biên bản thay cho dòng chấm.
alter table public.customers
  add column if not exists representative_name text,
  add column if not exists representative_title text,
  add column if not exists bank_account_number text,
  add column if not exists bank_name text;
