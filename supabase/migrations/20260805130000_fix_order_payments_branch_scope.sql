-- ---------------------------------------------------------------------
-- order_payments bị bỏ sót khi nâng cấp phân quyền chi nhánh cho orders/
-- order_equipment/order_tasks (migration 20260727000000_role_hierarchy.sql)
-- — insert/update vẫn chỉ check is_employee(), KHÔNG đối chiếu order_id có
-- thuộc chi nhánh người gọi hay không. Hệ quả: Cửa hàng trưởng/Kỹ thuật-
-- Sale ở chi nhánh A tạo/sửa được khoản thanh toán cho đơn của chi nhánh B.
--
-- SELECT giữ nguyên is_employee() (không branch-scope) — khớp quyết định
-- CEO 2026-08-05 đã mở SELECT orders/order_equipment/order_tasks cho MỌI
-- nhân viên xem toàn hệ thống (hỗ trợ chéo chi nhánh), xem migration
-- 20260731000000 và 20260805120000. Chỉ INSERT/UPDATE cần siết lại — ghi/
-- sửa tiền vẫn phải đúng phạm vi chi nhánh như orders/order_tasks.
-- ---------------------------------------------------------------------

drop policy if exists "order_payments_insert_employees" on public.order_payments;
create policy "order_payments_insert_branch_scoped" on public.order_payments
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_payments.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );

drop policy if exists "order_payments_update_employees" on public.order_payments;
create policy "order_payments_update_branch_scoped" on public.order_payments
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_payments.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_payments.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
