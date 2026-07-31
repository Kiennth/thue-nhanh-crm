-- ---------------------------------------------------------------------
-- Cửa hàng trưởng ĐỌC được đơn của mọi chi nhánh
--
-- CEO chốt 2026-07-31: cửa hàng trưởng là người có kinh nghiệm, đôi lúc cần
-- xem đơn kho khác để hỗ trợ. Mặc định màn hình vẫn chỉ hiện đơn kho mình
-- phụ trách (lọc ở tầng UI, xem orders/page.tsx) — mở quyền ở đây chỉ để khi
-- bạn ấy chủ động tìm sâu hơn thì không bị chặn.
--
-- CHỈ nới quyền SELECT. Insert/update/delete vẫn giới hạn theo chi nhánh như
-- cũ: xem được đơn kho khác, nhưng không sửa được.
--
-- Kỹ thuật/Sale (ky_thuat_sales) giữ nguyên phạm vi chi nhánh ở mọi thao tác.
-- ---------------------------------------------------------------------

drop policy if exists "orders_select_branch_scoped" on public.orders;
create policy "orders_select_branch_scoped" on public.orders
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')
    or (
      public.auth_role() = 'ky_thuat_sales'
      and (pickup_branch_id = public.auth_branch_id() or return_branch_id = public.auth_branch_id())
    )
  );

-- Xem được đơn mà không xem được dòng hàng/khâu của đơn thì vô nghĩa — nới
-- kèm hai bảng con, vẫn chỉ ở quyền đọc.
drop policy if exists "order_equipment_select_branch_scoped" on public.order_equipment;
create policy "order_equipment_select_branch_scoped" on public.order_equipment
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')
    or (
      public.auth_role() = 'ky_thuat_sales'
      and exists (
        select 1 from public.orders o
        where o.id = order_equipment.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );

drop policy if exists "order_tasks_select_branch_scoped" on public.order_tasks;
create policy "order_tasks_select_branch_scoped" on public.order_tasks
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')
    or (
      public.auth_role() = 'ky_thuat_sales'
      and exists (
        select 1 from public.orders o
        where o.id = order_tasks.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
