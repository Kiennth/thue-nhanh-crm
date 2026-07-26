-- Cải tổ phân quyền: 5 vai trò (Giám đốc > Admin > Kế toán > Cửa hàng
-- trưởng > Kỹ thuật/Sale) + giới hạn Cửa hàng trưởng/Kỹ thuật-Sale theo
-- đúng chi nhánh mình phụ trách (đơn hàng, thiết bị, bảng lương — KHÔNG
-- giới hạn khách hàng, vì bảng customers không có cột chi nhánh và 1 khách
-- có thể thuê ở nhiều chi nhánh).
--
-- QUAN TRỌNG — chạy đúng 3 lượt, TÁCH RIÊNG, đợi lượt trước chạy xong mới
-- dán lượt sau. Postgres không cho dùng giá trị enum mới thêm (ADD VALUE)
-- ngay trong cùng transaction nó được thêm — dán chung sẽ lỗi "unsafe use
-- of new value of enum type".

-- ============================================================
-- LƯỢT 1 — CHỈ đổi enum, KHÔNG kèm gì khác. Dán và chạy riêng.
-- ============================================================

alter type public.user_role rename value 'quan_ly_chi_nhanh' to 'cua_hang_truong';
alter type public.user_role add value 'giam_doc';

-- ============================================================
-- LƯỢT 2 — dán và chạy SAU KHI Lượt 1 đã chạy thành công.
-- ============================================================

-- Hàm lấy branch_id của người đang đăng nhập, giống mẫu auth_role()/
-- is_employee() đã có sẵn — dùng cho mọi policy giới hạn theo chi nhánh.
create function public.auth_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.employees where user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------
-- branches — CRUD chuyển thành độc quyền Giám đốc (trước là admin-only).
-- ---------------------------------------------------------------------
drop policy if exists "branches_write_admin" on public.branches;
create policy "branches_write_admin" on public.branches
  for all to authenticated
  using (public.auth_role() = 'giam_doc')
  with check (public.auth_role() = 'giam_doc');

-- ---------------------------------------------------------------------
-- employees — quản lý nhân sự: thêm giam_doc vào cùng tầng admin+ke_toan.
-- ---------------------------------------------------------------------
drop policy if exists "employees_select_admin_ketoan" on public.employees;
create policy "employees_select_admin_ketoan" on public.employees
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "employees_write_admin_ketoan" on public.employees;
create policy "employees_write_admin_ketoan" on public.employees
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "employees_update_admin_ketoan" on public.employees;
create policy "employees_update_admin_ketoan" on public.employees
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "employees_delete_admin_ketoan" on public.employees;
create policy "employees_delete_admin_ketoan" on public.employees
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- ---------------------------------------------------------------------
-- commission_tiers / task_weights / bonus_tiers — chính sách khoán/thưởng
-- chuyển thành độc quyền Giám đốc (trước là admin). Xem chính sách vẫn
-- admin+ke_toan (không mở cho Cửa hàng trưởng/Kỹ thuật-Sale).
-- ---------------------------------------------------------------------
drop policy if exists "commission_tiers_select_admin_ketoan" on public.commission_tiers;
create policy "commission_tiers_select_admin_ketoan" on public.commission_tiers
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "commission_tiers_write_admin" on public.commission_tiers;
create policy "commission_tiers_write_admin" on public.commission_tiers
  for insert to authenticated with check (public.auth_role() = 'giam_doc');
drop policy if exists "commission_tiers_update_admin" on public.commission_tiers;
create policy "commission_tiers_update_admin" on public.commission_tiers
  for update to authenticated
  using (public.auth_role() = 'giam_doc')
  with check (public.auth_role() = 'giam_doc');
drop policy if exists "commission_tiers_delete_admin" on public.commission_tiers;
create policy "commission_tiers_delete_admin" on public.commission_tiers
  for delete to authenticated using (public.auth_role() = 'giam_doc');

drop policy if exists "task_weights_select_admin_ketoan" on public.task_weights;
create policy "task_weights_select_admin_ketoan" on public.task_weights
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "task_weights_update_admin" on public.task_weights;
create policy "task_weights_update_admin" on public.task_weights
  for update to authenticated
  using (public.auth_role() = 'giam_doc')
  with check (public.auth_role() = 'giam_doc');

drop policy if exists "bonus_tiers_select_admin_ketoan" on public.bonus_tiers;
create policy "bonus_tiers_select_admin_ketoan" on public.bonus_tiers
  for select to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "bonus_tiers_write_admin" on public.bonus_tiers;
create policy "bonus_tiers_write_admin" on public.bonus_tiers
  for insert to authenticated with check (public.auth_role() = 'giam_doc');
drop policy if exists "bonus_tiers_update_admin" on public.bonus_tiers;
create policy "bonus_tiers_update_admin" on public.bonus_tiers
  for update to authenticated
  using (public.auth_role() = 'giam_doc')
  with check (public.auth_role() = 'giam_doc');
drop policy if exists "bonus_tiers_delete_admin" on public.bonus_tiers;
create policy "bonus_tiers_delete_admin" on public.bonus_tiers
  for delete to authenticated using (public.auth_role() = 'giam_doc');

-- ---------------------------------------------------------------------
-- orders — giới hạn Cửa hàng trưởng/Kỹ thuật-Sale theo chi nhánh nhận
-- HOẶC trả (khớp đúng bộ lọc UI "mềm" đã có sẵn ở orders/page.tsx, giờ
-- siết thật ở RLS).
-- ---------------------------------------------------------------------
drop policy if exists "orders_select_employees" on public.orders;
create policy "orders_select_branch_scoped" on public.orders
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and (pickup_branch_id = public.auth_branch_id() or return_branch_id = public.auth_branch_id())
    )
  );

drop policy if exists "orders_insert_employees" on public.orders;
create policy "orders_insert_branch_scoped" on public.orders
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and (pickup_branch_id = public.auth_branch_id() or return_branch_id = public.auth_branch_id())
    )
  );

drop policy if exists "orders_update_employees" on public.orders;
create policy "orders_update_branch_scoped" on public.orders
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and (pickup_branch_id = public.auth_branch_id() or return_branch_id = public.auth_branch_id())
    )
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and (pickup_branch_id = public.auth_branch_id() or return_branch_id = public.auth_branch_id())
    )
  );

drop policy if exists "orders_delete_admin_ketoan" on public.orders;
create policy "orders_delete_admin_ketoan" on public.orders
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- order_equipment / order_tasks không có cột chi nhánh riêng — tra chi
-- nhánh qua đơn cha (orders.pickup_branch_id/return_branch_id).
drop policy if exists "order_equipment_select_employees" on public.order_equipment;
create policy "order_equipment_select_branch_scoped" on public.order_equipment
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_equipment.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_equipment_insert_employees" on public.order_equipment;
create policy "order_equipment_insert_branch_scoped" on public.order_equipment
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_equipment.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_equipment_update_employees" on public.order_equipment;
create policy "order_equipment_update_branch_scoped" on public.order_equipment
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_equipment.order_id
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
        where o.id = order_equipment.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_equipment_delete_employees" on public.order_equipment;
create policy "order_equipment_delete_branch_scoped" on public.order_equipment
  for delete to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_equipment.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );

drop policy if exists "order_tasks_select_employees" on public.order_tasks;
create policy "order_tasks_select_branch_scoped" on public.order_tasks
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_tasks.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_tasks_insert_employees" on public.order_tasks;
create policy "order_tasks_insert_branch_scoped" on public.order_tasks
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_tasks.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_tasks_update_employees" on public.order_tasks;
create policy "order_tasks_update_branch_scoped" on public.order_tasks
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and exists (
        select 1 from public.orders o
        where o.id = order_tasks.order_id
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
        where o.id = order_tasks.order_id
          and (o.pickup_branch_id = public.auth_branch_id() or o.return_branch_id = public.auth_branch_id())
      )
    )
  );
drop policy if exists "order_tasks_delete_admin_ketoan" on public.order_tasks;
create policy "order_tasks_delete_admin_ketoan" on public.order_tasks
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- ---------------------------------------------------------------------
-- equipment_types / equipment_units / pricing_templates / *_tiers — danh
-- mục dùng chung toàn hệ thống, KHÔNG gắn chi nhánh cụ thể. Chỉ thêm
-- giam_doc vào tầng ghi hiện có (admin+ke_toan) — không mở cho Cửa hàng
-- trưởng (đó là cấu hình sản phẩm/giá dùng chung, không phải vận hành
-- riêng 1 chi nhánh).
-- ---------------------------------------------------------------------
drop policy if exists "equipment_types_write_admin_ketoan" on public.equipment_types;
create policy "equipment_types_write_admin_ketoan" on public.equipment_types
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "equipment_types_update_admin_ketoan" on public.equipment_types;
create policy "equipment_types_update_admin_ketoan" on public.equipment_types
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "equipment_types_delete_admin_ketoan" on public.equipment_types;
create policy "equipment_types_delete_admin_ketoan" on public.equipment_types
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "equipment_units_write_admin_ketoan" on public.equipment_units;
create policy "equipment_units_write_admin_ketoan" on public.equipment_units
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "equipment_units_update_admin_ketoan" on public.equipment_units;
create policy "equipment_units_update_admin_ketoan" on public.equipment_units
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "equipment_units_delete_admin_ketoan" on public.equipment_units;
create policy "equipment_units_delete_admin_ketoan" on public.equipment_units
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "pricing_templates_insert_admin_ketoan" on public.pricing_templates;
create policy "pricing_templates_insert_admin_ketoan" on public.pricing_templates
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "pricing_templates_update_admin_ketoan" on public.pricing_templates;
create policy "pricing_templates_update_admin_ketoan" on public.pricing_templates
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "pricing_templates_delete_admin_ketoan" on public.pricing_templates;
create policy "pricing_templates_delete_admin_ketoan" on public.pricing_templates
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "pricing_template_tiers_insert_admin_ketoan" on public.pricing_template_tiers;
create policy "pricing_template_tiers_insert_admin_ketoan" on public.pricing_template_tiers
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "pricing_template_tiers_update_admin_ketoan" on public.pricing_template_tiers;
create policy "pricing_template_tiers_update_admin_ketoan" on public.pricing_template_tiers
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "pricing_template_tiers_delete_admin_ketoan" on public.pricing_template_tiers;
create policy "pricing_template_tiers_delete_admin_ketoan" on public.pricing_template_tiers
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- ---------------------------------------------------------------------
-- equipment_stock / equipment_instances / equipment_transfers /
-- equipment_purchases / equipment_disposals — CÓ gắn chi nhánh cụ thể.
-- Đọc: giới hạn chi nhánh cho Cửa hàng trưởng/Kỹ thuật-Sale. Ghi: thêm
-- giam_doc vào tầng admin+ke_toan hiện có, và thêm Cửa hàng trưởng
-- (branch-scoped, quyền MỚI — Kỹ thuật/Sale KHÔNG có quyền ghi, giữ
-- nguyên chỉ đọc như hiện tại).
-- ---------------------------------------------------------------------
drop policy if exists "equipment_stock_select_employees" on public.equipment_stock;
create policy "equipment_stock_select_branch_scoped" on public.equipment_stock
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales') and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_stock_write_admin_ketoan" on public.equipment_stock;
create policy "equipment_stock_write_admin_ketoan" on public.equipment_stock
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_stock_update_admin_ketoan" on public.equipment_stock;
create policy "equipment_stock_update_admin_ketoan" on public.equipment_stock
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_stock_delete_admin_ketoan" on public.equipment_stock;
create policy "equipment_stock_delete_admin_ketoan" on public.equipment_stock
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "equipment_instances_select_employees" on public.equipment_instances;
create policy "equipment_instances_select_branch_scoped" on public.equipment_instances
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and branch_id is not distinct from public.auth_branch_id()
    )
  );
drop policy if exists "equipment_instances_insert_admin_ketoan" on public.equipment_instances;
create policy "equipment_instances_insert_admin_ketoan" on public.equipment_instances
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_instances_update_admin_ketoan" on public.equipment_instances;
create policy "equipment_instances_update_admin_ketoan" on public.equipment_instances
  for update to authenticated
  using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id is not distinct from public.auth_branch_id())
  )
  with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id is not distinct from public.auth_branch_id())
  );
drop policy if exists "equipment_instances_delete_admin_ketoan" on public.equipment_instances;
create policy "equipment_instances_delete_admin_ketoan" on public.equipment_instances
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

drop policy if exists "equipment_transfers_select_employees" on public.equipment_transfers;
create policy "equipment_transfers_select_branch_scoped" on public.equipment_transfers
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales')
      and (from_branch_id = public.auth_branch_id() or to_branch_id = public.auth_branch_id())
    )
  );
drop policy if exists "equipment_transfers_insert_admin_ketoan" on public.equipment_transfers;
create policy "equipment_transfers_insert_admin_ketoan" on public.equipment_transfers
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() = 'cua_hang_truong'
      and (from_branch_id = public.auth_branch_id() or to_branch_id = public.auth_branch_id())
    )
  );

drop policy if exists "equipment_purchases_select_employees" on public.equipment_purchases;
create policy "equipment_purchases_select_branch_scoped" on public.equipment_purchases
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales') and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_purchases_insert_admin_ketoan" on public.equipment_purchases;
create policy "equipment_purchases_insert_admin_ketoan" on public.equipment_purchases
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );

drop policy if exists "equipment_disposals_select_employees" on public.equipment_disposals;
create policy "equipment_disposals_select_branch_scoped" on public.equipment_disposals
  for select to authenticated using (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() in ('cua_hang_truong', 'ky_thuat_sales') and branch_id = public.auth_branch_id())
  );
drop policy if exists "equipment_disposals_insert_admin_ketoan" on public.equipment_disposals;
create policy "equipment_disposals_insert_admin_ketoan" on public.equipment_disposals
  for insert to authenticated with check (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and branch_id = public.auth_branch_id())
  );

-- RPC (security invoker — chịu RLS + check nội bộ riêng của người gọi):
-- record_equipment_purchase / record_equipment_disposal / transfer_equipment_stock
-- đều nhận p_branch_id (hoặc p_from_branch_id/p_to_branch_id) làm tham số —
-- cập nhật check nội bộ khớp với policy branch-scoped ở trên.
create or replace function public.record_equipment_purchase(
  p_equipment_unit_id uuid,
  p_branch_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_purchase_date date,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
begin
  if not (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and p_branch_id = public.auth_branch_id())
  ) then
    raise exception 'Không có quyền mua hàng';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng mua phải lớn hơn 0';
  end if;

  if p_unit_cost < 0 then
    raise exception 'Giá mua không được âm';
  end if;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
  values (p_equipment_unit_id, p_branch_id, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;

  insert into public.equipment_purchases
    (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_cost, p_purchase_date, p_note, public.auth_employee_id());
end;
$$;

create or replace function public.record_equipment_disposal(
  p_equipment_unit_id uuid,
  p_branch_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_disposal_date date,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_in_stock integer;
begin
  if not (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and p_branch_id = public.auth_branch_id())
  ) then
    raise exception 'Không có quyền bán/thanh lý';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng bán phải lớn hơn 0';
  end if;

  if p_unit_price < 0 then
    raise exception 'Giá bán không được âm';
  end if;

  select quantity_in_stock into v_in_stock
    from public.equipment_stock
    where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id
    for update;

  if v_in_stock is null or v_in_stock < p_quantity then
    raise exception 'Không đủ tồn kho để thanh lý';
  end if;

  update public.equipment_stock
    set quantity_in_stock = quantity_in_stock - p_quantity
    where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id;

  insert into public.equipment_disposals
    (equipment_unit_id, branch_id, quantity, unit_price, disposal_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_price, p_disposal_date, p_note, public.auth_employee_id());
end;
$$;

create or replace function public.transfer_equipment_stock(
  p_equipment_unit_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_quantity integer,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_in_stock integer;
begin
  if not (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (
      public.auth_role() = 'cua_hang_truong'
      and (p_from_branch_id = public.auth_branch_id() or p_to_branch_id = public.auth_branch_id())
    )
  ) then
    raise exception 'Không có quyền chuyển kho';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Chi nhánh nguồn và đích phải khác nhau';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng chuyển phải lớn hơn 0';
  end if;

  select quantity_in_stock into v_in_stock
    from public.equipment_stock
    where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id
    for update;

  if v_in_stock is null or v_in_stock < p_quantity then
    raise exception 'Không đủ tồn kho ở chi nhánh nguồn để chuyển';
  end if;

  update public.equipment_stock
    set quantity_in_stock = quantity_in_stock - p_quantity
    where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
  values (p_equipment_unit_id, p_to_branch_id, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;

  insert into public.equipment_transfers
    (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
  values
    (p_equipment_unit_id, p_from_branch_id, p_to_branch_id, p_quantity, p_note, public.auth_employee_id());
end;
$$;

-- ---------------------------------------------------------------------
-- customers — KHÔNG giới hạn chi nhánh (theo quyết định CEO). Chỉ cần
-- giam_doc lọt qua is_employee() tự động vì is_employee() không so vai
-- trò cụ thể — không cần đổi policy nào ở đây.
-- ---------------------------------------------------------------------

-- ============================================================
-- LƯỢT 3 — data 1 lần, dán và chạy CUỐI CÙNG sau khi Lượt 2 xong.
-- employees.email là email liên hệ nội bộ (VD ceo@thuenhanh.vn), KHÁC với
-- email đăng nhập Supabase Auth — đã xác nhận id chính xác bằng:
--   select id, name, email, role from public.employees where role = 'admin';
-- (thấy đúng 3 dòng: Nguyễn Trung Kiên id a3a98086-f9f8-46cd-b1f5-6d5e52d8f17f,
-- Hoa Phạm, Hồng Nga — chỉ update dòng Kiên, theo id, không theo email).
-- ============================================================

update public.employees set role = 'giam_doc' where id = 'a3a98086-f9f8-46cd-b1f5-6d5e52d8f17f';
