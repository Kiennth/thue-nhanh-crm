-- =============================================================================
-- Mở rộng module Thiết bị theo hướng Booqable:
--   - equipment_types phân 3 loại: rental (cho thuê) / sale (bán) / service (dịch vụ)
--   - Hàng cho thuê chia 2 kiểu theo dõi: quantity (số lượng, dùng equipment_units
--     + equipment_stock như hiện tại) / individual (từng sản phẩm riêng lẻ,
--     dùng equipment_instances mới — vd xe theo biển số)
--   - Giá cho thuê: flat_fee (giá cố định theo giờ/ngày/tuần/tháng/năm) hoặc
--     pricing_structure (áp bảng giá mẫu dùng chung nhiều sản phẩm, bậc thang
--     % chiết khấu theo thời lượng thuê — cùng kiểu với commission_tiers)
--   - Hàng bán (sale) dùng chung equipment_units/equipment_stock với hàng cho
--     thuê theo số lượng (cùng là "theo dõi số lượng theo chi nhánh").
--   - Hàng dịch vụ (service) không có tồn kho, chỉ tên + giá.
-- =============================================================================

create type public.product_type as enum ('rental', 'sale', 'service');
create type public.tracking_type as enum ('individual', 'quantity');
create type public.pricing_method as enum ('flat_fee', 'pricing_structure');
create type public.rental_period_unit as enum ('hour', 'day', 'week', 'month', 'year');
create type public.equipment_instance_status as enum ('available', 'rented', 'maintenance');

-- -----------------------------------------------------------------------------
-- Bảng giá mẫu dùng chung nhiều sản phẩm — mỗi bậc là % GIẢM so với giá
-- tuyến tính (giá cơ bản của sản phẩm × số đơn vị thời gian), áp dụng khi thuê
-- từ min_duration đơn vị trở lên. VD: thuê từ 7 ngày => giảm 40% trên tổng
-- tiền thuê tuyến tính (tức chỉ phải trả 60%).
-- -----------------------------------------------------------------------------

create table public.pricing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pricing_templates_set_updated_at
  before update on public.pricing_templates
  for each row execute function public.set_updated_at();

create table public.pricing_template_tiers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pricing_templates(id) on delete cascade,
  min_duration integer not null check (min_duration > 0),
  duration_unit public.rental_period_unit not null,
  discount_percentage numeric(5, 2) not null
    check (discount_percentage > 0 and discount_percentage <= 100),
  created_at timestamptz not null default now(),
  unique (template_id, min_duration, duration_unit)
);

-- -----------------------------------------------------------------------------
-- equipment_types: thêm phân loại hàng hoá + cách tính giá
-- -----------------------------------------------------------------------------

alter table public.equipment_types rename column rental_price_per_day to price;

alter table public.equipment_types
  add column product_type public.product_type not null default 'rental',
  add column tracking_type public.tracking_type,
  add column pricing_method public.pricing_method,
  add column rental_period_unit public.rental_period_unit,
  add column pricing_template_id uuid references public.pricing_templates(id);

-- Backfill: dữ liệu hiện có coi như hàng cho thuê, theo dõi số lượng, giá cố
-- định theo ngày — đúng hành vi trước migration này.
update public.equipment_types
set tracking_type = 'quantity',
    pricing_method = 'flat_fee',
    rental_period_unit = 'day'
where product_type = 'rental';

alter table public.equipment_types
  add constraint equipment_types_type_consistency check (
    (
      product_type = 'rental'
      and tracking_type is not null
      and pricing_method is not null
      and rental_period_unit is not null
    )
    or
    (
      product_type in ('sale', 'service')
      and tracking_type is null
      and pricing_method is null
      and rental_period_unit is null
      and pricing_template_id is null
    )
  ),
  add constraint equipment_types_pricing_template_consistency check (
    (pricing_method = 'pricing_structure' and pricing_template_id is not null)
    or
    (pricing_method is distinct from 'pricing_structure' and pricing_template_id is null)
  );

-- -----------------------------------------------------------------------------
-- equipment_instances: theo dõi từng sản phẩm riêng lẻ (product_type=rental,
-- tracking_type=individual) — vd xe theo biển số, không dùng equipment_units.
-- -----------------------------------------------------------------------------

create table public.equipment_instances (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  identifier_code text not null unique,
  branch_id uuid references public.branches(id) on delete set null,
  status public.equipment_instance_status not null default 'available',
  condition_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger equipment_instances_set_updated_at
  before update on public.equipment_instances
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger đảm bảo dùng đúng bảng theo đúng tracking_type của sản phẩm cha:
-- equipment_units/equipment_stock cho hàng bán + hàng thuê theo số lượng,
-- equipment_instances cho hàng thuê theo dõi riêng lẻ.
-- -----------------------------------------------------------------------------

create function public.check_equipment_unit_tracking()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
begin
  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if not (v_product_type = 'sale' or (v_product_type = 'rental' and v_tracking_type = 'quantity')) then
    raise exception 'equipment_units chỉ áp dụng cho hàng bán hoặc hàng cho thuê theo dõi số lượng';
  end if;

  return new;
end;
$$;

create trigger equipment_units_check_tracking
  before insert or update on public.equipment_units
  for each row execute function public.check_equipment_unit_tracking();

create function public.check_equipment_instance_tracking()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
begin
  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if not (v_product_type = 'rental' and v_tracking_type = 'individual') then
    raise exception 'equipment_instances chỉ áp dụng cho hàng cho thuê theo dõi riêng lẻ';
  end if;

  return new;
end;
$$;

create trigger equipment_instances_check_tracking
  before insert or update on public.equipment_instances
  for each row execute function public.check_equipment_instance_tracking();

-- -----------------------------------------------------------------------------
-- RLS — cùng nguyên tắc với equipment_types/equipment_units hiện có: mọi nhân
-- viên đọc được, chỉ Admin + Kế toán sửa.
-- -----------------------------------------------------------------------------

alter table public.pricing_templates enable row level security;
alter table public.pricing_template_tiers enable row level security;
alter table public.equipment_instances enable row level security;

create policy "pricing_templates_select_employees" on public.pricing_templates
  for select to authenticated using (public.is_employee());
create policy "pricing_templates_insert_admin_ketoan" on public.pricing_templates
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "pricing_templates_update_admin_ketoan" on public.pricing_templates
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "pricing_templates_delete_admin_ketoan" on public.pricing_templates
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create policy "pricing_template_tiers_select_employees" on public.pricing_template_tiers
  for select to authenticated using (public.is_employee());
create policy "pricing_template_tiers_insert_admin_ketoan" on public.pricing_template_tiers
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "pricing_template_tiers_update_admin_ketoan" on public.pricing_template_tiers
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "pricing_template_tiers_delete_admin_ketoan" on public.pricing_template_tiers
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_instances_select_employees" on public.equipment_instances
  for select to authenticated using (public.is_employee());
create policy "equipment_instances_insert_admin_ketoan" on public.equipment_instances
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "equipment_instances_update_admin_ketoan" on public.equipment_instances
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "equipment_instances_delete_admin_ketoan" on public.equipment_instances
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
