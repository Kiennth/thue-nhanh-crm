-- ---------------------------------------------------------------------
-- Danh mục (category) PHẲNG cho equipment_types — 1 sản phẩm thuộc đúng 1
-- danh mục, không phân cấp cha/con.
--
-- Để dạng BẢNG chứ không phải enum: chắc chắn còn thêm danh mục mới theo
-- thời gian, cùng lý do đã áp dụng cho expense_categories (xem migration
-- 20260801000000_expenses.sql) — enum thì mỗi lần thêm là một migration.
-- ---------------------------------------------------------------------
create table if not exists public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger equipment_categories_set_updated_at
  before update on public.equipment_categories
  for each row execute function public.set_updated_at();

-- category_id NULLABLE + on delete SET NULL (khác on delete restrict của
-- expenses.category_id): xoá 1 danh mục không nên bị chặn hay kéo theo xoá
-- sản phẩm — sản phẩm chỉ đơn giản rơi về "Chưa phân loại".
alter table public.equipment_types
  add column if not exists category_id uuid references public.equipment_categories(id) on delete set null;

create index if not exists equipment_types_category_id_idx
  on public.equipment_types (category_id);

-- ---------------------------------------------------------------------
-- RLS — đọc mọi nhân viên; ghi dùng ĐÚNG bộ vai trò đang quản lý
-- equipment_types (giam_doc/admin/ke_toan, xem equipment_types_write_
-- admin_ketoan ở migration 20260727000000_role_hierarchy.sql) — ai sửa
-- được sản phẩm thì sửa được danh mục của nó.
-- ---------------------------------------------------------------------
alter table public.equipment_categories enable row level security;

create policy "equipment_categories_select_employees" on public.equipment_categories
  for select to authenticated using (public.is_employee());
create policy "equipment_categories_write_admin_ketoan" on public.equipment_categories
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_categories_update_admin_ketoan" on public.equipment_categories
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_categories_delete_admin_ketoan" on public.equipment_categories
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- KHÔNG seed dữ liệu mẫu, KHÔNG gán category mặc định cho equipment_types
-- hiện có — category_id giữ null (hiển thị "Chưa phân loại" ở tầng UI), để
-- Giám đốc/Kế toán/Admin tự tạo danh mục và phân loại dần qua UI.
