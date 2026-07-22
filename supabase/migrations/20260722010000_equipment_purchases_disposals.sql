-- =============================================================================
-- Mua hàng (nhập kho có giá vốn) + Bán/thanh lý thiết bị không dùng nữa —
-- để tính giá vốn bình quân gia quyền, lợi nhuận, và giá trị tồn kho.
--
-- Quyết định đã chốt với người dùng:
--   - Giá vốn lưu theo TỪNG LẦN MUA (equipment_purchases), giá vốn dùng cho
--     báo cáo = bình quân gia quyền theo các lần mua, không phải 1 giá cố
--     định — cho hàng theo dõi SỐ LƯỢNG (equipment_units).
--   - Hàng theo dõi RIÊNG LẺ (equipment_instances, VD xe theo biển số) chỉ
--     mua đúng 1 lần — lưu trực tiếp purchase_price/purchase_date trên
--     chính dòng equipment_instances, không cần bảng lịch sử riêng.
--   - Thanh lý ghi nhận giá bán thu được + giảm tồn kho ngay lập tức; giá
--     bán thanh lý được cộng vào lợi nhuận trọn đời của thiết bị đó.
-- =============================================================================

alter type public.equipment_instance_status add value 'disposed';

alter table public.equipment_instances
  add column purchase_price numeric(14, 2),
  add column purchase_date date,
  add column disposal_price numeric(14, 2),
  add column disposal_date date;

-- -----------------------------------------------------------------------------
-- equipment_purchases — lịch sử mua hàng cho biến thể theo dõi số lượng
-- (equipment_units, dùng cho hàng thuê-theo-số-lượng và hàng bán).
-- -----------------------------------------------------------------------------

create table public.equipment_purchases (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid not null references public.equipment_units(id),
  branch_id uuid not null references public.branches(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  purchase_date date not null default current_date,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.equipment_disposals (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid not null references public.equipment_units(id),
  branch_id uuid not null references public.branches(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  disposal_date date not null default current_date,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

alter table public.equipment_purchases enable row level security;
alter table public.equipment_disposals enable row level security;

create policy "equipment_purchases_select_employees" on public.equipment_purchases
  for select to authenticated using (public.is_employee());
create policy "equipment_purchases_insert_admin_ketoan" on public.equipment_purchases
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_disposals_select_employees" on public.equipment_disposals
  for select to authenticated using (public.is_employee());
create policy "equipment_disposals_insert_admin_ketoan" on public.equipment_disposals
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));

-- Không có policy update/delete — đây là sổ ghi lịch sử mua/bán, không cho
-- sửa/xoá sau khi ghi (giống equipment_transfers).

-- -----------------------------------------------------------------------------
-- record_equipment_purchase / record_equipment_disposal — cộng/trừ tồn kho
-- và ghi lịch sử trong 1 transaction, giống transfer_equipment_stock().
-- -----------------------------------------------------------------------------

create function public.record_equipment_purchase(
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
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền mua hàng';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng mua phải lớn hơn 0';
  end if;

  if p_unit_cost < 0 then
    raise exception 'Giá mua không được âm';
  end if;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_total, quantity_available)
  values (p_equipment_unit_id, p_branch_id, p_quantity, p_quantity)
  on conflict (equipment_unit_id, branch_id)
  do update set
    quantity_total = public.equipment_stock.quantity_total + excluded.quantity_total,
    quantity_available = public.equipment_stock.quantity_available + excluded.quantity_available;

  insert into public.equipment_purchases
    (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_cost, p_purchase_date, p_note, public.auth_employee_id());
end;
$$;

grant execute on function public.record_equipment_purchase to authenticated;

create function public.record_equipment_disposal(
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
  v_available integer;
begin
  if public.auth_role() not in ('admin', 'ke_toan') then
    raise exception 'Không có quyền bán/thanh lý';
  end if;

  if p_quantity <= 0 then
    raise exception 'Số lượng bán phải lớn hơn 0';
  end if;

  if p_unit_price < 0 then
    raise exception 'Giá bán không được âm';
  end if;

  select quantity_available into v_available
  from public.equipment_stock
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id
  for update;

  if v_available is null or v_available < p_quantity then
    raise exception 'Không đủ số lượng sẵn có để thanh lý';
  end if;

  update public.equipment_stock
  set quantity_total = quantity_total - p_quantity,
      quantity_available = quantity_available - p_quantity
  where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id;

  insert into public.equipment_disposals
    (equipment_unit_id, branch_id, quantity, unit_price, disposal_date, note, created_by)
  values
    (p_equipment_unit_id, p_branch_id, p_quantity, p_unit_price, p_disposal_date, p_note, public.auth_employee_id());
end;
$$;

grant execute on function public.record_equipment_disposal to authenticated;
