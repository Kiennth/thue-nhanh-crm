-- =============================================================================
-- CRM Cho Thuê Thiết Bị — Schema khởi tạo (Giai đoạn 1)
-- Theo mục 4 PRD_CRM_cho_thue_thiet_bi.md
--
-- Phạm vi: tạo đầy đủ các bảng trong mục 4 để đúng thiết kế tổng thể.
-- CRUD UI ở giai đoạn này chỉ dùng: branches, employees, customers,
-- equipment_types, equipment_units. Các bảng orders/order_equipment/
-- order_tasks/commission_tiers/task_weights/bonus_tiers được tạo cấu trúc
-- nhưng KHÔNG có UI/logic nghiệp vụ — engine tính khoán làm ở lượt sau.
-- Không tạo monthly_payroll (PRD: view/tính toán, không lưu cứng).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.user_role as enum (
  'admin',
  'ke_toan',
  'ky_thuat_sales',
  'quan_ly_chi_nhanh'
);

create type public.task_type as enum (
  'tiep_nhan_bao_gia',
  'chot_don',
  'ky_hop_dong',
  'chuan_bi',
  'giao_hang',
  'van_hanh',
  'thu_hoi',
  'nhap_kho'
);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper (dùng cho các bảng có CRUD ở giai đoạn này)
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- branches (chi nhánh)
-- -----------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_wage_region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- employees (nhân viên)
-- -----------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  branch_id uuid references public.branches(id) on delete set null,
  base_salary numeric(14, 2) not null default 0,
  role public.user_role not null default 'ky_thuat_sales',
  email text unique,
  user_id uuid unique references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- customers (khách hàng)
-- -----------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- equipment_types (sản phẩm cha — loại thiết bị)
-- -----------------------------------------------------------------------------

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  rental_price_per_day numeric(14, 2) not null check (rental_price_per_day >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger equipment_types_set_updated_at
  before update on public.equipment_types
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- equipment_units (sản phẩm con — biến thể theo hãng/model)
-- -----------------------------------------------------------------------------

create table public.equipment_units (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  brand_model text not null,
  quantity_total integer not null default 0 check (quantity_total >= 0),
  quantity_available integer not null default 0 check (quantity_available >= 0),
  condition_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quantity_available_not_over_total check (quantity_available <= quantity_total)
);

create trigger equipment_units_set_updated_at
  before update on public.equipment_units
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- orders (đơn hàng) — tạo cấu trúc, chưa có UI/logic ở giai đoạn này
-- -----------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  branch_id uuid not null references public.branches(id),
  customer_id uuid not null references public.customers(id),
  order_date date not null default current_date,
  total_value numeric(14, 2) not null default 0,
  current_stage integer not null default 1 check (current_stage between 1 and 9),
  created_at timestamptz not null default now()
);

-- order_equipment (thiết bị trong đơn — n-n tới sản phẩm con cụ thể)
create table public.order_equipment (
  order_id uuid not null references public.orders(id) on delete cascade,
  equipment_unit_id uuid not null references public.equipment_units(id),
  quantity integer not null default 1 check (quantity > 0),
  primary key (order_id, equipment_unit_id)
);

-- order_tasks (8 giai đoạn tính khoán của từng đơn)
create table public.order_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  task_type public.task_type not null,
  employee_id uuid references public.employees(id),
  completed_date date,
  note text,
  has_issue boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, task_type)
);

-- -----------------------------------------------------------------------------
-- commission_tiers / task_weights / bonus_tiers — cấu hình cho engine tính
-- khoán (mục 3.4). Tạo cấu trúc bảng, chưa có UI nhập liệu ở giai đoạn này.
-- -----------------------------------------------------------------------------

create table public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  tier_number integer not null,
  min_value numeric(14, 2) not null,
  max_value numeric(14, 2),
  percentage numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  unique (branch_id, tier_number)
);

create table public.task_weights (
  id uuid primary key default gen_random_uuid(),
  task_type public.task_type not null unique,
  weight_percentage numeric(5, 2) not null,
  created_at timestamptz not null default now()
);

create table public.bonus_tiers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  tier_number integer not null,
  threshold_amount numeric(14, 2) not null,
  bonus_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  unique (branch_id, tier_number)
);

-- =============================================================================
-- Helper functions cho RLS (SECURITY DEFINER để tránh đệ quy khi policy trên
-- chính bảng employees gọi lại các hàm này)
-- =============================================================================

create function public.auth_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid() limit 1;
$$;

create function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employees where user_id = auth.uid() limit 1;
$$;

create function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.employees where user_id = auth.uid());
$$;

-- View công khai cho nội bộ: thông tin cơ bản của nhân viên, KHÔNG có
-- base_salary — dùng để chọn người phụ trách ở các module khác mà không lộ
-- lương. View này thuộc sở hữu của role chạy migration (postgres), nên khi
-- authenticated user truy vấn qua view, RLS row-level của bảng employees
-- (vốn chỉ cho ky_thuat_sales xem đúng 1 dòng của mình) sẽ KHÔNG áp dụng —
-- đây là pattern chuẩn của Supabase để lộ 1 phần cột công khai.
create view public.employees_public as
  select id, name, department, branch_id, role, is_active
  from public.employees;

grant select on public.employees_public to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.customers enable row level security;
alter table public.equipment_types enable row level security;
alter table public.equipment_units enable row level security;
alter table public.orders enable row level security;
alter table public.order_equipment enable row level security;
alter table public.order_tasks enable row level security;
alter table public.commission_tiers enable row level security;
alter table public.task_weights enable row level security;
alter table public.bonus_tiers enable row level security;

-- ---- branches: mọi nhân viên đọc được, chỉ Admin sửa ----------------------

create policy "branches_select_employees" on public.branches
  for select to authenticated
  using (public.is_employee());

create policy "branches_write_admin" on public.branches
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

-- ---- employees: Admin + Kế toán CRUD toàn bộ; nhân viên khác chỉ đọc dòng
-- của chính mình (đầy đủ cột, kể cả base_salary) --------------------------

create policy "employees_select_admin_ketoan" on public.employees
  for select to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'));

create policy "employees_select_self" on public.employees
  for select to authenticated
  using (user_id = auth.uid());

create policy "employees_write_admin_ketoan" on public.employees
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "employees_update_admin_ketoan" on public.employees
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "employees_delete_admin_ketoan" on public.employees
  for delete to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'));

-- ---- customers: Admin, Kế toán, Kỹ thuật/Sales đều CRUD được -------------

create policy "customers_all_employees" on public.customers
  for all to authenticated
  using (public.is_employee())
  with check (public.is_employee());

-- ---- equipment_types / equipment_units: mọi nhân viên đọc, chỉ Admin +
-- Kế toán sửa (giá thuê, tồn kho) -------------------------------------------

create policy "equipment_types_select_employees" on public.equipment_types
  for select to authenticated
  using (public.is_employee());

create policy "equipment_types_write_admin_ketoan" on public.equipment_types
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_types_update_admin_ketoan" on public.equipment_types
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_types_delete_admin_ketoan" on public.equipment_types
  for delete to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_units_select_employees" on public.equipment_units
  for select to authenticated
  using (public.is_employee());

create policy "equipment_units_write_admin_ketoan" on public.equipment_units
  for insert to authenticated
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_units_update_admin_ketoan" on public.equipment_units
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_units_delete_admin_ketoan" on public.equipment_units
  for delete to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'));

-- ---- orders / order_equipment / order_tasks / commission_tiers /
-- task_weights / bonus_tiers: chưa có UI ở giai đoạn này. Đặt mặc định an
-- toàn "chỉ Admin" để tránh lộ dữ liệu qua API trong lúc chờ thiết kế
-- quyền chi tiết cùng engine tính khoán ở lượt sau. -------------------------

create policy "orders_admin_only" on public.orders
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "order_equipment_admin_only" on public.order_equipment
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "order_tasks_admin_only" on public.order_tasks
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "commission_tiers_admin_only" on public.commission_tiers
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "task_weights_admin_only" on public.task_weights
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "bonus_tiers_admin_only" on public.bonus_tiers
  for all to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');
