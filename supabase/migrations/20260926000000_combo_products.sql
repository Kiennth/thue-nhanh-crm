-- Combo sản phẩm (CEO 2026-09-26): 1 mã "combo" gồm nhiều sản phẩm con. Thêm
-- combo vào đơn thì hệ thống tự tạo dòng con cho từng món (serial/biến thể
-- thật) để tồn kho, giao/thu hồi, RFID chạy như dòng thường.
--
-- Doanh thu (CEO chọn phương án b): dòng combo (dòng mẹ) để 0đ, tiền combo
-- CHIA cho các dòng con theo tỉ lệ giá thuê lẻ — nên tổng đơn
-- (recalc_order_total), báo cáo doanh thu theo thiết bị, khoán... tự đúng mà
-- không phải sửa từng báo cáo. Được đổi món con trên đơn (giữ phần doanh thu
-- của món cũ, ghi chú ai đổi).
--
-- Mã cũ tên "Combo ..." (sản phẩm đơn có tồn kho riêng) giữ nguyên, chỉ combo
-- tạo mới mới dùng cơ chế này.

alter type public.tracking_type add value if not exists 'combo';

create table public.equipment_type_components (
  id uuid primary key default gen_random_uuid(),
  combo_type_id uuid not null references public.equipment_types(id) on delete cascade,
  component_type_id uuid not null references public.equipment_types(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (combo_type_id, component_type_id),
  check (combo_type_id <> component_type_id)
);

create index equipment_type_components_combo_idx
  on public.equipment_type_components (combo_type_id);

alter table public.equipment_type_components enable row level security;

create policy "equipment_type_components_select" on public.equipment_type_components
  for select to authenticated using (public.is_employee());
create policy "equipment_type_components_insert" on public.equipment_type_components
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_type_components_update" on public.equipment_type_components
  for update to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_type_components_delete" on public.equipment_type_components
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- Dòng con của combo trỏ về dòng mẹ; xoá dòng combo là xoá luôn các món con.
alter table public.order_equipment
  add column parent_line_id uuid references public.order_equipment(id) on delete cascade;

create index order_equipment_parent_line_idx
  on public.order_equipment (parent_line_id)
  where parent_line_id is not null;

-- Bản mới nhất của trigger (20260730010000) + nhánh combo: dòng mẹ không gắn
-- biến thể/máy, đơn phải có thời gian thuê; dòng con phải cùng đơn với mẹ.
create or replace function public.check_order_equipment_line()
returns trigger as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
  v_has_rental_period boolean;
  v_parent_order uuid;
begin
  if tg_op = 'UPDATE'
     and new.equipment_type_id is not distinct from old.equipment_type_id
     and new.equipment_unit_id is not distinct from old.equipment_unit_id
     and new.equipment_instance_id is not distinct from old.equipment_instance_id
     and new.quantity is not distinct from old.quantity
     and new.order_id is not distinct from old.order_id
     and new.parent_line_id is not distinct from old.parent_line_id
  then
    return new;
  end if;

  if new.parent_line_id is not null then
    select order_id into v_parent_order from public.order_equipment where id = new.parent_line_id;
    if v_parent_order is distinct from new.order_id then
      raise exception 'Dòng con của combo phải cùng đơn với dòng combo';
    end if;
  end if;

  if new.equipment_type_id is null then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng hàng tự do không được gắn biến thể hoặc sản phẩm riêng lẻ';
    end if;
    return new;
  end if;

  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if v_product_type = 'service' then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng hàng dịch vụ không được gắn biến thể hoặc sản phẩm riêng lẻ';
    end if;
  elsif v_product_type = 'sale' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng bán phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng bán không dùng sản phẩm riêng lẻ';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type::text = 'combo' then
    if new.equipment_unit_id is not null or new.equipment_instance_id is not null then
      raise exception 'Dòng combo không gắn biến thể/máy — các món nằm ở dòng con';
    end if;
    if new.parent_line_id is not null then
      raise exception 'Combo không lồng trong combo khác';
    end if;
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'quantity' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng cho thuê theo số lượng phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng cho thuê theo số lượng không dùng sản phẩm riêng lẻ';
    end if;
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
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
    select (rental_start_at is not null and rental_end_at is not null) into v_has_rental_period
    from public.orders where id = new.order_id;
    if not coalesce(v_has_rental_period, false) then
      raise exception 'Đơn phải có thời gian thuê (ngày giờ bắt đầu/kết thúc) trước khi thêm hàng cho thuê';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;


-- Dòng combo không có tồn kho riêng (món con mới là hàng thật, vẫn được kiểm
-- trùng lịch như thường) — bỏ khỏi cảnh báo trùng lịch để khỏi báo "thiếu"
-- nhầm. Bản gốc: 20260809040000_order_schedule_conflicts.sql.
create or replace function public.order_schedule_conflicts(p_order_id uuid)
returns table (
  equipment_type_id uuid,
  equipment_type_name text,
  capacity numeric,
  my_quantity numeric,
  others_quantity numeric,
  conflicting_orders jsonb
)
language sql
stable
set search_path = public
as $$
with me as (
  select id, rental_start_at, rental_end_at
  from orders
  where id = p_order_id
    and cancelled_at is null
    and completed_at is null
    and rental_start_at is not null
    and rental_end_at is not null
    and rental_end_at >= now()
),
my_lines as (
  select oe.equipment_type_id, sum(oe.quantity) as qty
  from order_equipment oe
  join equipment_types t on t.id = oe.equipment_type_id and t.product_type = 'rental'
    and t.tracking_type::text is distinct from 'combo'
  where oe.order_id = p_order_id
    and oe.equipment_type_id is not null
  group by oe.equipment_type_id
),
other_lines as (
  select oe.equipment_type_id,
         o.id as order_id, o.order_code, o.rental_start_at, o.rental_end_at,
         sum(oe.quantity) as qty
  from orders o
  join order_equipment oe on oe.order_id = o.id
  cross join me
  where o.id <> me.id
    and o.cancelled_at is null
    and o.completed_at is null
    and o.rental_start_at is not null
    and o.rental_end_at is not null
    and o.rental_start_at < me.rental_end_at
    and o.rental_end_at > me.rental_start_at
    and oe.equipment_type_id in (select ml.equipment_type_id from my_lines ml)
  group by oe.equipment_type_id, o.id, o.order_code, o.rental_start_at, o.rental_end_at
),
capacity as (
  select ml.equipment_type_id,
         coalesce((
           select sum(es.quantity_total)
           from equipment_stock es
           join equipment_units u on u.id = es.equipment_unit_id
           where u.equipment_type_id = ml.equipment_type_id
         ), 0)
         + coalesce((
           select count(*)
           from equipment_instances i
           join equipment_types t on t.id = i.equipment_type_id and t.tracking_type = 'individual'
           where i.equipment_type_id = ml.equipment_type_id
             and i.status <> 'disposed'
         ), 0) as total_qty
  from my_lines ml
)
select
  ml.equipment_type_id,
  t.name as equipment_type_name,
  c.total_qty as capacity,
  ml.qty as my_quantity,
  coalesce(sum(ol.qty), 0) as others_quantity,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderId', ol.order_id,
        'orderCode', ol.order_code,
        'rentalStartAt', ol.rental_start_at,
        'rentalEndAt', ol.rental_end_at,
        'quantity', ol.qty
      ) order by ol.rental_start_at
    ) filter (where ol.order_id is not null),
    '[]'::jsonb
  ) as conflicting_orders
from my_lines ml
join equipment_types t on t.id = ml.equipment_type_id
join capacity c on c.equipment_type_id = ml.equipment_type_id
left join other_lines ol on ol.equipment_type_id = ml.equipment_type_id
group by ml.equipment_type_id, t.name, c.total_qty, ml.qty
having ml.qty + coalesce(sum(ol.qty), 0) > c.total_qty;
$$;
