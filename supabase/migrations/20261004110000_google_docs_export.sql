-- Chứng từ → Google Docs trong Drive của ceo@thuenhanh.vn (CEO 2026-10-04:
-- "để PDF thì tao sẽ không sửa được"). CEO bấm "Kết nối Google Drive" 1 lần
-- (OAuth, quyền drive.file — CRM chỉ thấy file do chính nó tạo); mỗi chứng
-- từ của 1 đơn = 1 file Google Docs trong thư mục "Chứng từ CRM", mở lại
-- đúng file cũ để giữ chỗ đã sửa tay.

-- Token kết nối — CHỈ server (service role) đọc/ghi: bật RLS, không policy nào.
create table if not exists public.google_integration (
  id text primary key default 'drive',
  account_email text,
  refresh_token text not null,
  folder_id text,
  connected_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.google_integration enable row level security;

-- File Google Docs đã tạo cho từng (đơn, loại chứng từ).
create table if not exists public.order_google_docs (
  order_id uuid not null references public.orders(id) on delete cascade,
  doc_type text not null,
  file_id text not null,
  url text not null,
  created_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (order_id, doc_type)
);
alter table public.order_google_docs enable row level security;
drop policy if exists "order_google_docs_select_employees" on public.order_google_docs;
create policy "order_google_docs_select_employees" on public.order_google_docs
  for select to authenticated using (public.is_employee());
