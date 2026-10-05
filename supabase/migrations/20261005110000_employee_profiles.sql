-- Hồ sơ nhân viên (CEO 2026-10-05): SĐT công ty/cá nhân, liên lạc khẩn cấp,
-- Facebook, CCCD... Bảng riêng vì có CCCD — chỉ Giám đốc đọc/sửa (cùng
-- quyền trang Nhân viên); nhân viên đọc được hồ sơ của chính mình.
create table if not exists public.employee_profiles (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_phone text,
  personal_phone text,
  emergency_name text,
  emergency_relation text,
  emergency_phone text,
  facebook_url text,
  citizen_id text,
  citizen_id_issued_on date,
  citizen_id_issued_place text,
  address text,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;

drop policy if exists employee_profiles_director on public.employee_profiles;
create policy employee_profiles_director on public.employee_profiles
  for all to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active and e.role = 'giam_doc'))
  with check (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active and e.role = 'giam_doc'));

drop policy if exists employee_profiles_self on public.employee_profiles;
create policy employee_profiles_self on public.employee_profiles
  for select to authenticated
  using (employee_id in (select id from public.employees where user_id = auth.uid()));
