-- ---------------------------------------------------------------------
-- Kỹ thuật/Sales ĐỌC được đơn của mọi chi nhánh (như Cửa hàng trưởng)
--
-- CEO chốt 2026-08-05: mở rộng quyết định 2026-07-31
-- (20260731000000_branch_manager_reads_all_orders.sql) — trước đó chỉ nới
-- cho Cửa hàng trưởng, Kỹ thuật/Sales vẫn giữ nguyên phạm vi chi nhánh
-- ("Kỹ thuật/Sale (ky_thuat_sales) giữ nguyên phạm vi chi nhánh ở mọi thao
-- tác"). Giờ Kỹ thuật/Sales cũng cần xem đơn kho khác (VD: hỗ trợ chéo,
-- trang chủ "Đơn hàng sắp tới/sắp về" mở toàn hệ thống).
--
-- CHỈ nới quyền SELECT — insert/update/delete vẫn giữ nguyên branch-scoped
-- như cũ (không đổi các policy ghi).
-- ---------------------------------------------------------------------

drop policy if exists "orders_select_branch_scoped" on public.orders;
create policy "orders_select_branch_scoped" on public.orders
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong', 'ky_thuat_sales')
  );

drop policy if exists "order_equipment_select_branch_scoped" on public.order_equipment;
create policy "order_equipment_select_branch_scoped" on public.order_equipment
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong', 'ky_thuat_sales')
  );

drop policy if exists "order_tasks_select_branch_scoped" on public.order_tasks;
create policy "order_tasks_select_branch_scoped" on public.order_tasks
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong', 'ky_thuat_sales')
  );
