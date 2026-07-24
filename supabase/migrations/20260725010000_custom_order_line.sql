-- =============================================================================
-- Dòng hàng "tự do" trong đơn — cho phép thêm 1 khoản phí/phụ phí phát sinh
-- (tên + số lượng + đơn giá) mà không cần tạo equipment_type (SKU) mới trong
-- danh mục. equipment_type_id giờ nullable; đúng 1 trong 2 (equipment_type_id
-- hoặc custom_name) phải có giá trị.
-- =============================================================================

alter table public.order_equipment
  alter column equipment_type_id drop not null,
  add column custom_name text;

alter table public.order_equipment
  add constraint order_equipment_custom_or_catalog check (
    (equipment_type_id is not null and custom_name is null)
    or (equipment_type_id is null and custom_name is not null)
  );

create or replace function public.check_order_equipment_line()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
  v_has_rental_period boolean;
begin
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
