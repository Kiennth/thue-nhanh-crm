-- B6 (Grok CRM 09/10): form khách tách Công ty / Cá nhân, bỏ ô chung "MST / CCCD".
--   * tax_code      = MST (công ty) — giữ cột cũ.
--   * id_number     = số CCCD 12 số (cá nhân) — cột riêng; giao diện che
--                     "1234xxxx" với vai trò không phải quản lý (CEO 09/10);
--                     KHÔNG in vào báo giá/chứng từ, KHÔNG trả ra web.
--   * contact_name  = người liên hệ (công ty) — khác representative_name
--                     (người đại diện ký hợp đồng).
--   * wants_vat / invoice_email — có VAT thì MST + email hoá đơn bắt buộc.
--   * legacy_tax_or_id = bản sao ô "MST / CCCD" cũ (xoá sau khi rà xong).
--   * needs_review  = dữ liệu cũ không khớp mẫu → chip "Khách cần bổ sung".
-- Không mã hoá CCCD (Grok cho phép "ít nhất tách cột, giới hạn quyền đọc").
alter table public.customers
  add column if not exists id_number text,
  add column if not exists contact_name text,
  add column if not exists wants_vat boolean not null default false,
  add column if not exists invoice_email text,
  add column if not exists legacy_tax_or_id text,
  add column if not exists needs_review boolean not null default false;

create index if not exists customers_id_number_idx on public.customers (id_number) where id_number is not null;

-- Chuyển dữ liệu cũ (đã chạy thử đếm 09/10: cá nhân 12 số = 7, cá nhân dạng
-- MST 10 số = 22, công ty MST = 1.201, công ty CMND 9 số = 1, khác = 1).
update public.customers set legacy_tax_or_id = tax_code
where tax_code is not null and legacy_tax_or_id is null;

-- Cá nhân có CCCD 12 số → id_number, xoá khỏi ô MST.
update public.customers
set id_number = regexp_replace(tax_code, '[\s.]', '', 'g'), tax_code = null
where customer_type = 'individual'
  and regexp_replace(coalesce(tax_code, ''), '[\s.]', '', 'g') ~ '^\d{12}$';

-- Công ty có MST đúng mẫu → coi như lấy hoá đơn VAT.
update public.customers
set wants_vat = true
where customer_type = 'company'
  and regexp_replace(coalesce(tax_code, ''), '[\s.]', '', 'g') ~ '^\d{10}(-\d{3})?$';

-- Không khớp mẫu → cần rà: cá nhân mà ô ghi dạng MST/khác, công ty mà ô
-- không phải MST (CMND 9 số, chữ…).
update public.customers
set needs_review = true
where tax_code is not null
  and (
    customer_type = 'individual'
    or regexp_replace(tax_code, '[\s.]', '', 'g') !~ '^\d{10}(-\d{3})?$'
  );

notify pgrst, 'reload schema';
