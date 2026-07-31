-- ---------------------------------------------------------------------
-- Chi phí ĐỊNH KỲ: thuê nhà hàng tháng, trả góp xe, lãi ngân hàng...
--
-- CEO yêu cầu 2026-08-01: khai một lần, chọn chu kỳ và ngày kết thúc.
-- KHÔNG materialize thành dòng expenses — mỗi kỳ được "trải" ra lúc đọc
-- (xem src/lib/recurring-expenses.ts): sửa định kỳ là sửa mọi tháng, hết
-- hạn thì tự ngừng, không có job chạy ngầm nào để mà quên tắt.
-- ---------------------------------------------------------------------

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  -- Chu kỳ lặp: hàng tháng (thuê nhà, trả góp), hàng quý (lãi ngân hàng trả
  -- quý), hàng năm (bảo hiểm, phí đăng kiểm).
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'quarterly', 'yearly')),
  -- Ngày bắt đầu cũng ấn định NGÀY GHI mỗi kỳ (bắt đầu mùng 5 → mùng 5 hằng
  -- tháng; tháng ngắn thì lùi về ngày cuối tháng).
  start_date date not null,
  -- Ngày kết thúc hợp đồng/khoản vay — null là chưa hẹn ngày dừng.
  end_date date check (end_date is null or end_date >= start_date),
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();
create trigger recurring_expenses_log_activity
  after insert or update or delete on public.recurring_expenses
  for each row execute function public.log_activity();

alter table public.recurring_expenses enable row level security;

-- Cùng ranh giới với bảng expenses: quản lý toàn hệ thống, cửa hàng trưởng
-- đúng kho mình.
create policy "recurring_expenses_select_scoped" on public.recurring_expenses
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
create policy "recurring_expenses_insert_scoped" on public.recurring_expenses
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
create policy "recurring_expenses_update_scoped" on public.recurring_expenses
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
create policy "recurring_expenses_delete_scoped" on public.recurring_expenses
  for delete to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
