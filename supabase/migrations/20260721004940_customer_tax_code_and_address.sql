-- Bỏ tax_profile (không cần "chọn" hồ sơ thuế vì luật yêu cầu xuất hoá đơn
-- 100%) — thay bằng MST (mã số thuế) và địa chỉ, hai trường thật sự cần để
-- xuất hoá đơn đỏ.

alter table public.customers
  drop column tax_profile,
  add column tax_code text,
  add column address text;
