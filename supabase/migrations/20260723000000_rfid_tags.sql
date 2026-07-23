-- =============================================================================
-- Module RFID — Giai đoạn 0+1: gắn tag RFID vào thiết bị (equipment_units
-- theo dõi số lượng hoặc equipment_instances theo dõi riêng lẻ), quét khi
-- giao hàng/thu hồi để tự động đối chiếu với order_equipment thay vì đếm tay.
-- Kiểm kê kho định kỳ (giai đoạn 2) và gate reader tự động (giai đoạn 3) sẽ
-- thêm sau, dùng chung 2 bảng này.
-- =============================================================================

create type public.rfid_tag_status as enum ('in_stock', 'with_customer');
create type public.rfid_scan_type as enum ('giao_hang', 'thu_hoi');

-- -----------------------------------------------------------------------------
-- rfid_tags — mỗi dòng là 1 tag RFID gắn trên 1 sản phẩm vật lý cụ thể. Với
-- hàng theo dõi số lượng (equipment_units), nhiều tag có thể trỏ về cùng 1
-- equipment_unit_id (mỗi tag = 1 sản phẩm vật lý trong số lượng đó). Với hàng
-- theo dõi riêng lẻ, mỗi equipment_instance chỉ có tối đa 1 tag.
-- -----------------------------------------------------------------------------

create table public.rfid_tags (
  id uuid primary key default gen_random_uuid(),
  tag_code text not null unique,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  equipment_unit_id uuid references public.equipment_units(id) on delete cascade,
  equipment_instance_id uuid references public.equipment_instances(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  status public.rfid_tag_status not null default 'in_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfid_tags_one_target check (
    (equipment_unit_id is not null and equipment_instance_id is null)
    or (equipment_unit_id is null and equipment_instance_id is not null)
  ),
  constraint rfid_tags_instance_unique unique (equipment_instance_id)
);

create trigger rfid_tags_set_updated_at
  before update on public.rfid_tags
  for each row execute function public.set_updated_at();

-- Đảm bảo tag gắn đúng bảng theo tracking_type của equipment_type cha — cùng
-- nguyên tắc với check_equipment_unit_tracking/check_equipment_instance_tracking.
create function public.check_rfid_tag_tracking()
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
    raise exception 'Hàng dịch vụ không có tồn kho nên không gắn được tag RFID';
  elsif v_product_type = 'sale' or (v_product_type = 'rental' and v_tracking_type = 'quantity') then
    if new.equipment_unit_id is null then
      raise exception 'Sản phẩm theo dõi số lượng phải gắn tag vào 1 biến thể (equipment_unit)';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'individual' then
    if new.equipment_instance_id is null then
      raise exception 'Sản phẩm theo dõi riêng lẻ phải gắn tag vào 1 sản phẩm cụ thể (equipment_instance)';
    end if;
  end if;

  return new;
end;
$$;

create trigger rfid_tags_check_tracking
  before insert or update on public.rfid_tags
  for each row execute function public.check_rfid_tag_tracking();

-- -----------------------------------------------------------------------------
-- rfid_scan_log — audit trail mọi lần quét. giao_hang/thu_hoi luôn gắn 1 đơn
-- hàng cụ thể (dùng để đối chiếu số lượng quét được với order_equipment).
-- -----------------------------------------------------------------------------

create table public.rfid_scan_log (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.rfid_tags(id) on delete cascade,
  scan_type public.rfid_scan_type not null,
  order_id uuid references public.orders(id) on delete set null,
  branch_id uuid not null references public.branches(id),
  employee_id uuid references public.employees(id),
  scanned_at timestamptz not null default now()
);

create index rfid_scan_log_order_id_idx on public.rfid_scan_log (order_id);
create index rfid_scan_log_tag_id_idx on public.rfid_scan_log (tag_id);

-- Mỗi lần quét cập nhật vị trí/trạng thái hiện tại của tag — và đồng bộ luôn
-- equipment_instances.status cho hàng theo dõi riêng lẻ (giao hàng => rented,
-- thu hồi => available) thay vì phải sửa tay 2 nơi. security definer để nhân
-- viên thường (được phép quét) vẫn cập nhật được status/branch_id của tag dù
-- không có quyền UPDATE trực tiếp trên rfid_tags (việc đó chỉ dành cho
-- Admin/Kế toán gán tag) — chỉ 2 cột này bị đổi, không mở thêm quyền nào khác.
create function public.apply_rfid_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance_id uuid;
begin
  select equipment_instance_id into v_instance_id
  from public.rfid_tags where id = new.tag_id;

  if new.scan_type = 'giao_hang' then
    update public.rfid_tags set status = 'with_customer', branch_id = null where id = new.tag_id;
    if v_instance_id is not null then
      update public.equipment_instances set status = 'rented' where id = v_instance_id;
    end if;
  else
    update public.rfid_tags set status = 'in_stock', branch_id = new.branch_id where id = new.tag_id;
    if v_instance_id is not null then
      update public.equipment_instances set status = 'available' where id = v_instance_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger rfid_scan_log_apply
  after insert on public.rfid_scan_log
  for each row execute function public.apply_rfid_scan();

-- -----------------------------------------------------------------------------
-- RLS — gắn/xoá tag: chỉ Admin + Kế toán (giống quản lý thiết bị). Quét
-- giao/thu hồi: mọi nhân viên (thao tác vận hành hàng ngày).
-- -----------------------------------------------------------------------------

alter table public.rfid_tags enable row level security;
alter table public.rfid_scan_log enable row level security;

create policy "rfid_tags_select_employees" on public.rfid_tags
  for select to authenticated using (public.is_employee());
create policy "rfid_tags_insert_admin_ketoan" on public.rfid_tags
  for insert to authenticated with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "rfid_tags_update_admin_ketoan" on public.rfid_tags
  for update to authenticated
  using (public.auth_role() in ('admin', 'ke_toan'))
  with check (public.auth_role() in ('admin', 'ke_toan'));
create policy "rfid_tags_delete_admin_ketoan" on public.rfid_tags
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

create policy "rfid_scan_log_select_employees" on public.rfid_scan_log
  for select to authenticated using (public.is_employee());
create policy "rfid_scan_log_insert_employees" on public.rfid_scan_log
  for insert to authenticated with check (public.is_employee());
create policy "rfid_scan_log_delete_admin_ketoan" on public.rfid_scan_log
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
