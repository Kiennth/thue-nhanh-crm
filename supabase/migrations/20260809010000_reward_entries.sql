-- ---------------------------------------------------------------------
-- Thưởng đột xuất (CEO yêu cầu 2026-08-09): Giám đốc tạo khoản thưởng cho
-- 1 nhân viên hoặc cả công ty (mỗi người 1 dòng riêng — ai nhận bao nhiêu
-- rõ ràng, nhân viên vào sau không tự hưởng). Là thu nhập ĐỘT BIẾN: cộng
-- thẳng vào thu nhập tháng (như OT), KHÔNG tính vào cơ sở xét bậc thưởng
-- (bonus_tiers chỉ xét tổng khoán trong tháng).
--
-- "Sẽ được ghi chép lại": reason bắt buộc, lưu created_by; KHÔNG có policy
-- update — đây là sổ ghi chép, ghi sai thì xoá dòng tạo lại (delete cũng
-- chỉ Giám đốc), mọi insert/delete đều vào activity_log qua trigger.
--
-- RLS khác overtime_entries ở chỗ ghi: CEO chốt "giám đốc có thể tạo" —
-- insert/delete CHỈ giam_doc (không có Admin/Kế toán như OT); select cho
-- giam_doc/admin/ke_toan (kế toán cần đối chiếu bảng lương).
-- ---------------------------------------------------------------------

create table public.reward_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  entry_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create index reward_entries_employee_id_idx on public.reward_entries(employee_id);
create index reward_entries_entry_date_idx on public.reward_entries(entry_date);

alter table public.reward_entries enable row level security;

create policy "reward_entries_select_manage" on public.reward_entries
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "reward_entries_insert_giam_doc" on public.reward_entries
  for insert to authenticated with check (public.auth_role() = 'giam_doc');
create policy "reward_entries_delete_giam_doc" on public.reward_entries
  for delete to authenticated using (public.auth_role() = 'giam_doc');

create trigger reward_entries_log_activity after insert or update or delete on public.reward_entries
  for each row execute function public.log_activity();
