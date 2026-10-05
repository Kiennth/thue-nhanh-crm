-- Thông tin TRẢ hàng trên đơn (CEO 2026-10-05) — đi cặp với 3 ô giao hàng.
-- Cả 3 null = "Giống lúc giao" (đa số đơn giao đâu thu đó). Người trả hàng
-- hay khác người nhận (bảo vệ, nhân viên sự kiện...) nên có tên + SĐT riêng.
alter table public.orders
  add column if not exists return_address text,
  add column if not exists return_contact_name text,
  add column if not exists return_contact_phone text;
