-- =============================================================================
-- Module Đơn hàng — thay thế bảng orders/order_equipment/order_tasks placeholder
-- của giai đoạn 1 (chưa từng có UI/dữ liệu) bằng thiết kế khớp với module
-- Thiết bị đã xây lại (product_type/tracking_type/pricing_method) và quy trình
-- 10 khâu tính khoán hiện tại.
--
-- Quyết định đã chốt với người dùng:
--   - Doanh số đơn (total_value) tự động tính từ danh sách thiết bị (trigger),
--     nhân viên vẫn sửa tay được — nhưng sửa tay sẽ bị ghi đè lại nếu sau đó
--     danh sách thiết bị thay đổi (trigger tính lại từ đầu).
--   - Mỗi dòng thiết bị cho thuê bắt buộc có ngày bắt đầu/kết thúc thuê.
--   - 10 khâu tính khoán phải hoàn thành TUẦN TỰ đúng thứ tự (không được hoàn
--     thành khâu sau khi khâu trước chưa xong) — enforce bằng so sánh thứ tự
--     khai báo của enum task_type (đã tạo đúng thứ tự nghiệp vụ).
--   - "Hoàn tất" đơn = mốc đóng đơn riêng (orders.completed_at), không tính
--     khoán, chỉ cho phép khi đủ 10 khâu đã hoàn thành.
--   - commission_tiers/task_weights/bonus_tiers là "chính sách khoán": theo
--     PRD chỉ Admin được sửa, Kế toán chỉ xem (khác với equipment vốn cho cả
--     Kế toán sửa).
-- =============================================================================

drop policy if exists "orders_admin_only" on public.orders;
drop policy if exists "order_equipment_admin_only" on public.order_equipment;
drop policy if exists "order_tasks_admin_only" on public.order_tasks;
drop policy if exists "commission_tiers_admin_only" on public.commission_tiers;
drop policy if exists "task_weights_admin_only" on public.task_weights;
drop policy if exists "bonus_tiers_admin_only" on public.bonus_tiers;

drop table if exists public.order_tasks;
drop table if exists public.order_equipment;
drop table if exists public.orders;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  branch_id uuid not null references public.branches(id),
  customer_id uuid not null references public.customers(id),
  order_date date not null default current_date,
  total_value numeric(14, 2) not null default 0,
  status public.task_type not null default 'tiep_nhan_yeu_cau',
  completed_at timestamptz,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_equipment — dòng thiết bị/sản phẩm trong đơn. Tuỳ product_type của
-- equipment_type mà dòng này gắn equipment_unit_id (bán, hoặc thuê theo số
-- lượng) hoặc equipment_instance_id (thuê theo dõi riêng lẻ) hoặc không gắn
-- gì cả (dịch vụ). unit_price/line_total là giá đã tính sẵn (snapshot tại
-- thời điểm thêm dòng — theo giá + bảng giá mẫu áp dụng lúc đó).
-- -----------------------------------------------------------------------------

create table public.order_equipment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id),
  equipment_unit_id uuid references public.equipment_units(id),
  equipment_instance_id uuid references public.equipment_instances(id),
  quantity integer not null default 1 check (quantity > 0),
  rental_start_date date,
  rental_end_date date,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint order_equipment_rental_dates_valid check (
    rental_start_date is null or rental_end_date is null or rental_end_date >= rental_start_date
  )
);

create function public.check_order_equipment_line()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
begin
  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if v_product_type = 'service' then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng hàng dịch vụ không được gắn biến thể hoặc sản phẩm riêng lẻ';
    end if;
    if new.rental_start_date is not null or new.rental_end_date is not null then
      raise exception 'Hàng dịch vụ không có ngày thuê';
    end if;
  elsif v_product_type = 'sale' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng bán phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng bán không dùng sản phẩm riêng lẻ';
    end if;
    if new.rental_start_date is not null or new.rental_end_date is not null then
      raise exception 'Hàng bán không có ngày thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'quantity' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng cho thuê theo số lượng phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng cho thuê theo số lượng không dùng sản phẩm riêng lẻ';
    end if;
    if new.rental_start_date is null or new.rental_end_date is null then
      raise exception 'Hàng cho thuê phải có ngày bắt đầu và kết thúc thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'individual' then
    if new.equipment_instance_id is null then
      raise exception 'Hàng cho thuê theo từng sản phẩm phải chọn sản phẩm cụ thể';
    end if;
    if new.equipment_unit_id is not null then
      raise exception 'Hàng cho thuê theo từng sản phẩm không dùng biến thể số lượng';
    end if;
    if new.quantity <> 1 then
      raise exception 'Hàng theo dõi riêng lẻ chỉ được số lượng 1';
    end if;
    if new.rental_start_date is null or new.rental_end_date is null then
      raise exception 'Hàng cho thuê phải có ngày bắt đầu và kết thúc thuê';
    end if;
  end if;

  return new;
end;
$$;

create trigger order_equipment_check_line
  before insert or update on public.order_equipment
  for each row execute function public.check_order_equipment_line();

-- Tự động tính lại orders.total_value = tổng line_total mỗi khi dòng thiết bị
-- thay đổi. Sửa tay total_value vẫn được, nhưng sẽ bị tính lại nếu sau đó có
-- thêm/sửa/xoá dòng thiết bị.
create function public.recalc_order_total()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  update public.orders
  set total_value = coalesce(
    (select sum(line_total) from public.order_equipment where order_id = v_order_id), 0
  )
  where id = v_order_id;

  return null;
end;
$$;

create trigger order_equipment_recalc_total
  after insert or update or delete on public.order_equipment
  for each row execute function public.recalc_order_total();

-- -----------------------------------------------------------------------------
-- order_tasks — 10 khâu tính khoán của từng đơn. Phải hoàn thành tuần tự theo
-- đúng thứ tự khai báo của enum task_type ("Hoàn tất" không nằm trong bảng
-- này — là orders.completed_at riêng, không tính khoán).
-- -----------------------------------------------------------------------------

create table public.order_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  task_type public.task_type not null,
  employee_id uuid references public.employees(id),
  completed_date date,
  note text,
  has_issue boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, task_type)
);

create function public.check_order_task_sequence()
returns trigger
language plpgsql
as $$
declare
  v_missing public.task_type;
begin
  if new.completed_date is null then
    return new;
  end if;

  select t.task_type into v_missing
  from unnest(enum_range(null::public.task_type)) as t(task_type)
  where t.task_type < new.task_type
    and not exists (
      select 1 from public.order_tasks ot
      where ot.order_id = new.order_id
        and ot.task_type = t.task_type
        and ot.completed_date is not null
    )
  order by t.task_type
  limit 1;

  if v_missing is not null then
    raise exception 'Phải hoàn thành khâu "%" trước khi hoàn thành khâu này', v_missing;
  end if;

  return new;
end;
$$;

create trigger order_tasks_check_sequence
  before insert or update on public.order_tasks
  for each row execute function public.check_order_task_sequence();

-- Đồng bộ orders.status = khâu sớm nhất chưa hoàn thành (dùng cho danh sách
-- đơn hiển thị tiến độ mà không cần join order_tasks mỗi lần).
create function public.sync_order_status()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_next public.task_type;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  select t.task_type into v_next
  from unnest(enum_range(null::public.task_type)) as t(task_type)
  where not exists (
    select 1 from public.order_tasks ot
    where ot.order_id = v_order_id
      and ot.task_type = t.task_type
      and ot.completed_date is not null
  )
  order by t.task_type
  limit 1;

  update public.orders
  set status = coalesce(v_next, 'nhap_kho_bao_tri')
  where id = v_order_id and completed_at is null;

  return null;
end;
$$;

create trigger order_tasks_sync_status
  after insert or update or delete on public.order_tasks
  for each row execute function public.sync_order_status();

-- Chỉ cho phép đóng đơn (completed_at) khi đủ 10 khâu đã hoàn thành.
create function public.check_order_completion()
returns trigger
language plpgsql
as $$
begin
  if new.completed_at is not null and (old.completed_at is null) then
    if (
      select count(*) from public.order_tasks
      where order_id = new.id and completed_date is not null
    ) < 10 then
      raise exception 'Phải hoàn thành đủ 10 khâu trước khi đóng đơn';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_check_completion
  before update on public.orders
  for each row execute function public.check_order_completion();

-- -----------------------------------------------------------------------------
-- RLS — orders/order_equipment/order_tasks: mọi nhân viên xem + tạo/sửa được
-- (PRD: Kỹ thuật/Sales "Tạo/sửa đơn hàng", Kế toán "xem/nhập đơn hàng"), chỉ
-- Admin + Kế toán xoá được (tránh mất dữ liệu ngoài ý muốn).
-- -----------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_equipment enable row level security;
alter table public.order_tasks enable row level security;

create policy "orders_select_employees" on public.orders
  for select to authenticated using (public.is_employee());
create policy "orders_insert_employees" on public.orders
  for insert to authenticated with check (public.is_employee());
create policy "orders_update_employees" on public.orders
  for update to authenticated
  using (public.is_employee())
  with check (public.is_employee());
create policy "orders_delete_admin_ketoan" on public.orders
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create policy "order_equipment_select_employees" on public.order_equipment
  for select to authenticated using (public.is_employee());
create policy "order_equipment_insert_employees" on public.order_equipment
  for insert to authenticated with check (public.is_employee());
create policy "order_equipment_update_employees" on public.order_equipment
  for update to authenticated
  using (public.is_employee())
  with check (public.is_employee());
create policy "order_equipment_delete_employees" on public.order_equipment
  for delete to authenticated using (public.is_employee());

create policy "order_tasks_select_employees" on public.order_tasks
  for select to authenticated using (public.is_employee());
create policy "order_tasks_insert_employees" on public.order_tasks
  for insert to authenticated with check (public.is_employee());
create policy "order_tasks_update_employees" on public.order_tasks
  for update to authenticated
  using (public.is_employee())
  with check (public.is_employee());
create policy "order_tasks_delete_admin_ketoan" on public.order_tasks
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

-- -----------------------------------------------------------------------------
-- commission_tiers / task_weights / bonus_tiers — "chính sách khoán": theo
-- PRD chỉ Admin được sửa, Kế toán chỉ xem (khác equipment cho cả Kế toán sửa).
-- -----------------------------------------------------------------------------

create policy "commission_tiers_select_admin_ketoan" on public.commission_tiers
  for select to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
create policy "commission_tiers_write_admin" on public.commission_tiers
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "commission_tiers_update_admin" on public.commission_tiers
  for update to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');
create policy "commission_tiers_delete_admin" on public.commission_tiers
  for delete to authenticated using (public.auth_role() = 'admin');

create policy "task_weights_select_admin_ketoan" on public.task_weights
  for select to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
create policy "task_weights_update_admin" on public.task_weights
  for update to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

create policy "bonus_tiers_select_admin_ketoan" on public.bonus_tiers
  for select to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
create policy "bonus_tiers_write_admin" on public.bonus_tiers
  for insert to authenticated with check (public.auth_role() = 'admin');
create policy "bonus_tiers_update_admin" on public.bonus_tiers
  for update to authenticated
  using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');
create policy "bonus_tiers_delete_admin" on public.bonus_tiers
  for delete to authenticated using (public.auth_role() = 'admin');
