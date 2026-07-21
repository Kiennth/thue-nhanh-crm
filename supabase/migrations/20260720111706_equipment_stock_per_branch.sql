-- =============================================================================
-- Sửa lỗi thiết kế tồn kho thiết bị
--
-- Migration 0001 gắn branch_id vào equipment_types (sản phẩm cha) — nghĩa là
-- 1 mã hàng chỉ thuộc đúng 1 chi nhánh. Sai với PRD mục 3.1: sản phẩm cha
-- dùng chung toàn hệ thống, TỒN KHO mới là thứ tách riêng theo từng chi
-- nhánh ("cùng 1 sản phẩm cha có thể tồn tại độc lập ở nhiều kho với số
-- lượng khác nhau"). Migration này:
--   - Bỏ branch_id khỏi equipment_types
--   - Chuyển quantity_total/quantity_available từ equipment_units sang bảng
--     equipment_stock riêng (equipment_unit_id + branch_id)
--   - Thêm equipment_transfers ghi lịch sử chuyển kho giữa các chi nhánh
--   - Thêm hàm transfer_equipment_stock() chuyển kho trong 1 transaction
--
-- An toàn chạy trên project hiện tại vì equipment_types/equipment_units
-- chưa có dữ liệu thật (mới scaffold, chưa nhập liệu).
-- =============================================================================

alter table public.equipment_types drop column branch_id;

alter table public.equipment_units
  drop column quantity_total,
  drop column quantity_available;

create table public.equipment_stock (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid not null references public.equipment_units(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  quantity_total integer not null default 0 check (quantity_total >= 0),
  quantity_available integer not null default 0 check (quantity_available >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_unit_id, branch_id),
  constraint equipment_stock_available_not_over_total check (quantity_available <= quantity_total)
);

create trigger equipment_stock_set_updated_at
  before update on public.equipment_stock
  for each row execute function public.set_updated_at();

create table public.equipment_transfers (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid not null references public.equipment_units(id),
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  quantity integer not null check (quantity > 0),
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  constraint equipment_transfers_different_branches check (from_branch_id <> to_branch_id)
);

alter table public.equipment_stock enable row level security;
alter table public.equipment_transfers enable row level security;

create policy "equipment_stock_select_employees" on public.equipment_stock
  for select to authenticated using (public.is_employee());

create policy "equipment_stock_write_admin_ketoan" on public.equipment_stock
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_stock_update_admin_ketoan" on public.equipment_stock
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_stock_delete_admin_ketoan" on public.equipment_stock
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_transfers_select_employees" on public.equipment_transfers
  for select to authenticated using (public.is_employee());

create policy "equipment_transfers_insert_admin_ketoan" on public.equipment_transfers
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));

-- Không có policy update/delete cho equipment_transfers — đây là audit trail,
-- không cho sửa/xoá sau khi ghi.

-- Chuyển kho: trừ tồn chi nhánh nguồn, cộng tồn chi nhánh đích, ghi lịch sử
-- — gộp trong 1 function để chạy atomic (không lệch số nếu có lỗi giữa chừng).
create function public.transfer_equipment_stock(
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
  v_available integer;
begin
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền chuyển kho';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Chi nhánh nguồn và đích phải khác nhau';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng chuyển phải lớn hơn 0';
  end if;

  select quantity_available into v_available
  from public.equipment_stock
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id
  for update;

  if v_available is null or v_available < p_quantity then
    raise exception 'Không đủ số lượng sẵn có ở chi nhánh nguồn';
  end if;

  update public.equipment_stock
  set quantity_total = quantity_total - p_quantity,
      quantity_available = quantity_available - p_quantity
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_from_branch_id;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_total, quantity_available)
  values (p_equipment_unit_id, p_to_branch_id, p_quantity, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_total = public.equipment_stock.quantity_total + excluded.quantity_total,
    quantity_available = public.equipment_stock.quantity_available + excluded.quantity_available;

  insert into public.equipment_transfers
    (equipment_unit_id, from_branch_id, to_branch_id, quantity, note, created_by)
  values
    (p_equipment_unit_id, p_from_branch_id, p_to_branch_id, p_quantity, p_note, public.auth_employee_id());
end;
$$;

grant execute on function public.transfer_equipment_stock to authenticated;
