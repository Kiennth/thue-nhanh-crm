-- Quét lại toàn bộ policy public còn nhắc "admin" mà thiếu "giam_doc" (đối
-- chiếu trực tiếp với pg_policies trên production) — migration
-- 20260727000000_role_hierarchy.sql chỉ cập nhật một phần bảng, bỏ sót 4 bảng
-- này. Đã gặp thực tế: OT báo lỗi "new row violates row-level security
-- policy for table overtime_entries" khi Giám đốc ghi nhận OT trong đơn hàng
-- (tương tự lỗi ảnh thiết bị đã sửa ở 20260726220000). Cập nhật lại cho khớp
-- MANAGE_ROLES (giam_doc, admin, ke_toan) hiện tại.

-- activity_log
drop policy if exists "activity_log_select_admin_ketoan" on public.activity_log;
create policy "activity_log_select_admin_ketoan" on public.activity_log
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- order_payments
drop policy if exists "order_payments_delete_admin_ketoan" on public.order_payments;
create policy "order_payments_delete_admin_ketoan" on public.order_payments
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- overtime_entries
drop policy if exists "overtime_entries_select_admin_ketoan" on public.overtime_entries;
drop policy if exists "overtime_entries_insert_admin_ketoan" on public.overtime_entries;
drop policy if exists "overtime_entries_update_admin_ketoan" on public.overtime_entries;
drop policy if exists "overtime_entries_delete_admin_ketoan" on public.overtime_entries;

create policy "overtime_entries_select_admin_ketoan" on public.overtime_entries
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "overtime_entries_insert_admin_ketoan" on public.overtime_entries
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "overtime_entries_update_admin_ketoan" on public.overtime_entries
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "overtime_entries_delete_admin_ketoan" on public.overtime_entries
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- rfid_scan_log
drop policy if exists "rfid_scan_log_delete_admin_ketoan" on public.rfid_scan_log;
create policy "rfid_scan_log_delete_admin_ketoan" on public.rfid_scan_log
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- rfid_tags
drop policy if exists "rfid_tags_insert_admin_ketoan" on public.rfid_tags;
drop policy if exists "rfid_tags_update_admin_ketoan" on public.rfid_tags;
drop policy if exists "rfid_tags_delete_admin_ketoan" on public.rfid_tags;

create policy "rfid_tags_insert_admin_ketoan" on public.rfid_tags
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "rfid_tags_update_admin_ketoan" on public.rfid_tags
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "rfid_tags_delete_admin_ketoan" on public.rfid_tags
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
