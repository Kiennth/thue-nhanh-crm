-- ---------------------------------------------------------------------
-- Module Thưởng giai đoạn 2 (CEO 2026-08-09):
-- 1. employees.birthday — ngày sinh nhân viên, để /rewards tự nhắc
--    "tháng này sinh nhật ai" (trước giờ chưa có trường này).
-- 2. reward_rules — qui tắc thưởng cấu hình sẵn, 2 loại:
--    - doanh_so: doanh số công ty trong tháng (CHỈ đơn hoàn tất, chưa
--      VAT — khớp "Tổng doanh số" trang Đơn hàng) đạt threshold_amount
--      thì gợi ý trao amount; Giám đốc bấm "Trao ngay" mới thành tiền.
--    - dinh_ky: khoản lặp mỗi tháng (phụ cấp chuyên cần...), Giám đốc
--      bấm "Áp kỳ này" 1 chạm — CỐ Ý không tự động: luôn có người
--      duyệt trước khi tiền vào lương, không lo double-run.
--    employee_id null = cả công ty (mỗi người 1 khoản khi áp).
-- 3. reward_entries.rule_id — khoản nào sinh ra từ qui tắc nào, để biết
--    "tháng này qui tắc X đã áp/trao chưa" (đếm entry theo rule_id trong
--    tháng, không đoán mò qua reason). Xoá qui tắc thì entry giữ lại,
--    rule_id về null (sổ ghi chép không mất).
-- ---------------------------------------------------------------------

alter table public.employees add column birthday date;

create table public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('doanh_so', 'dinh_ky')),
  label text not null check (length(trim(label)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  -- Bắt buộc có mốc với doanh_so, bắt buộc KHÔNG có với dinh_ky.
  threshold_amount numeric(14, 2) check ((rule_type = 'doanh_so') = (threshold_amount is not null)),
  employee_id uuid references public.employees(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.reward_rules enable row level security;

create policy "reward_rules_select_manage" on public.reward_rules
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "reward_rules_insert_giam_doc" on public.reward_rules
  for insert to authenticated with check (public.auth_role() = 'giam_doc');
create policy "reward_rules_update_giam_doc" on public.reward_rules
  for update to authenticated
  using (public.auth_role() = 'giam_doc')
  with check (public.auth_role() = 'giam_doc');
create policy "reward_rules_delete_giam_doc" on public.reward_rules
  for delete to authenticated using (public.auth_role() = 'giam_doc');

create trigger reward_rules_log_activity after insert or update or delete on public.reward_rules
  for each row execute function public.log_activity();

alter table public.reward_entries
  add column rule_id uuid references public.reward_rules(id) on delete set null;

create index reward_entries_rule_id_idx on public.reward_entries(rule_id);
