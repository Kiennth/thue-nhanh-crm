-- Khoán trực tiếp cho dòng dịch vụ (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ thuật — trả
-- thẳng % cho người thực hiện, tách khỏi quỹ khoán theo khâu) + OT (tăng ca,
-- khoản công ty trả thêm cho nhân viên, không charge khách hàng, không gắn
-- SKU nào).

alter table public.equipment_types
  add column payout_percentage numeric(5, 2)
    check (payout_percentage is null or (payout_percentage between 0 and 100));

-- Không on delete cascade — khớp order_tasks.employee_id, tránh mất lịch sử
-- khoán nếu nhân viên bị xoá cứng (thực tế chỉ soft-delete qua is_active).
-- Không thêm trigger activity_log cho order_equipment — bảng này đã cố tình
-- bị bỏ qua từ trước (sửa giá/số lượng xảy ra liên tục, quá nhiễu), 2 cột
-- mới kế thừa luôn quyết định đó.
alter table public.order_equipment
  add column employee_id uuid references public.employees(id),
  add column completed_date date;

create table public.overtime_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  order_id uuid references public.orders(id) on delete set null,
  entry_date date not null default current_date,
  hours numeric(5, 2),
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index overtime_entries_employee_id_idx on public.overtime_entries(employee_id);
create index overtime_entries_entry_date_idx on public.overtime_entries(entry_date);

alter table public.overtime_entries enable row level security;

-- Dữ liệu lương/khoán nhạy cảm (giống commission_tiers/bonus_tiers) — KHÔNG
-- mở is_employee() dù đây là nhập liệu giao dịch chứ không phải cấu hình
-- chính sách, nên write vẫn cho cả Admin + Kế toán (khác commission_tiers
-- admin-only), không riêng Admin.
create policy "overtime_entries_select_admin_ketoan" on public.overtime_entries
  for select to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
create policy "overtime_entries_insert_admin_ketoan" on public.overtime_entries
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "overtime_entries_update_admin_ketoan" on public.overtime_entries
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "overtime_entries_delete_admin_ketoan" on public.overtime_entries
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create trigger overtime_entries_log_activity after insert or update or delete on public.overtime_entries
  for each row execute function public.log_activity();
