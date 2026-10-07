-- Nhà cung cấp (CEO 2026-10-07): danh bạ nơi mua máy / phụ kiện / dịch vụ.
-- CEO yêu cầu: loại (công ty / cá nhân), tên, SĐT, địa chỉ, MST/CCCD, số TK,
-- tên ngân hàng. Thêm: chủ tài khoản (chuyển khoản cần đúng tên), người liên
-- hệ + email (NCC là công ty), mặt hàng cung cấp (tìm "ai bán MacBook"), ghi
-- chú, đang hợp tác (ẩn NCC cũ thay vì xoá).
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_type text not null default 'company' check (supplier_type in ('company', 'individual')),
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  email text,
  address text,
  tax_code text,
  bank_account_number text,
  bank_name text,
  bank_account_holder text,
  products text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_name_idx on public.suppliers (lower(name));

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists suppliers_log_activity on public.suppliers;
create trigger suppliers_log_activity
  after insert or update or delete on public.suppliers
  for each row execute function public.log_activity();

-- Xem/thêm/sửa: Giám đốc, Admin, Kế toán, Cửa hàng trưởng (người đi mua hàng
-- ở kho). Xoá: Giám đốc, Admin, Kế toán. Kỹ thuật/Sales không thấy (có số TK).
alter table public.suppliers enable row level security;

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                 and e.role in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')));
drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                      and e.role in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')));
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                 and e.role in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')));
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                 and e.role in ('giam_doc', 'admin', 'ke_toan')));
