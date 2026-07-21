-- =============================================================================
-- Thời gian thuê chuyển từ cấp DÒNG HÀNG (order_equipment) lên cấp ĐƠN HÀNG
-- (orders) — quy định công ty: mọi thiết bị trong 1 đơn bắt đầu/kết thúc thuê
-- CÙNG NHAU, dễ quản lý. Giá dòng hàng cho thuê giờ tính theo thời gian thuê
-- của đơn (không còn nhập riêng từng dòng).
-- =============================================================================

alter table public.orders
  add column rental_start_at timestamptz,
  add column rental_end_at timestamptz;

alter table public.orders
  add constraint orders_rental_dates_valid check (
    rental_start_at is null or rental_end_at is null or rental_end_at >= rental_start_at
  );

alter table public.order_equipment
  drop column rental_start_at,
  drop column rental_end_at;

create or replace function public.check_order_equipment_line()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
  v_has_rental_period boolean;
begin
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
$$;

-- Chặn xoá trắng thời gian thuê của đơn nếu đơn đã có dòng hàng cho thuê
-- (tránh dữ liệu giá bị "mồ côi" thời gian thuê).
create function public.check_order_rental_period_change()
returns trigger
language plpgsql
as $$
begin
  if (new.rental_start_at is null or new.rental_end_at is null)
     and (old.rental_start_at is not null or old.rental_end_at is not null) then
    if exists (
      select 1 from public.order_equipment oe
      join public.equipment_types et on et.id = oe.equipment_type_id
      where oe.order_id = new.id and et.product_type = 'rental'
    ) then
      raise exception 'Đơn đã có hàng cho thuê — không thể xoá thời gian thuê của đơn';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_check_rental_period_change
  before update on public.orders
  for each row execute function public.check_order_rental_period_change();
