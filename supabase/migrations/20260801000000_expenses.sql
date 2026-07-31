-- ---------------------------------------------------------------------
-- Module chi phí vận hành: thuê nhà, điện, nước, internet, vận chuyển...
--
-- Tách khỏi equipment_purchases (mua sắm thiết bị = đầu tư tài sản). Đây là
-- chi phí chạy hàng tháng, gắn với CHI NHÁNH để so sánh được giữa các kho và
-- ghép với doanh thu ra lãi từng chi nhánh.
--
-- CEO chốt 2026-08-01:
--   - Chi phí vận chuyển gộp theo tháng/chi nhánh, KHÔNG gắn theo từng đơn.
--   - Cửa hàng trưởng tự nhập chi phí kho mình và chỉ xem được kho mình.
--   - Giám đốc/Kế toán/Admin xem toàn hệ thống.
-- ---------------------------------------------------------------------

-- Hạng mục để dạng BẢNG chứ không phải enum: chắc chắn còn thêm hạng mục mới
-- (bảo trì xe, phí ngân hàng...) mà enum thì mỗi lần thêm là một migration.
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Thứ tự hiển thị cố định để màu trong biểu đồ cột chồng không nhảy lung
  -- tung mỗi lần đổi bộ lọc.
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Truy vấn luôn theo "chi nhánh + khoảng ngày" (trang chi phí, so sánh chi
-- nhánh, xu hướng 12 tháng) nên đánh index đúng cặp đó.
create index if not exists expenses_branch_date_idx
  on public.expenses (branch_id, expense_date);
create index if not exists expenses_category_date_idx
  on public.expenses (category_id, expense_date);

create trigger expense_categories_set_updated_at
  before update on public.expense_categories
  for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create trigger expenses_log_activity
  after insert or update or delete on public.expenses
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------
-- Hạng mục khởi tạo theo đúng danh sách CEO liệt kê, thêm "Khác" để không
-- bao giờ bí chỗ nhập.
-- ---------------------------------------------------------------------
insert into public.expense_categories (name, sort_order) values
  ('Thuê nhà', 10),
  ('Điện', 20),
  ('Nước', 30),
  ('Internet', 40),
  ('Vận chuyển hàng hoá', 50),
  ('Khác', 900)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

-- Hạng mục: ai là nhân viên đều đọc được (cần để hiển thị tên trong danh
-- sách), nhưng chỉ Giám đốc/Kế toán mới sửa được danh mục.
create policy "expense_categories_select_employees" on public.expense_categories
  for select to authenticated using (public.is_employee());
create policy "expense_categories_write_giamdoc_ketoan" on public.expense_categories
  for all to authenticated
  using (public.auth_role() in ('giam_doc', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'ke_toan'));

-- Khoản chi: Giám đốc/Admin/Kế toán toàn hệ thống; Cửa hàng trưởng đúng kho
-- mình (cả đọc lẫn ghi). Kỹ thuật/Sale không thấy gì.
create policy "expenses_select_scoped" on public.expenses
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );

create policy "expenses_insert_scoped" on public.expenses
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );

create policy "expenses_update_scoped" on public.expenses
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );

create policy "expenses_delete_scoped" on public.expenses
  for delete to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
