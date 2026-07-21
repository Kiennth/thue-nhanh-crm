-- =============================================================================
-- Ngày bắt đầu/kết thúc thuê chuyển từ date sang timestamptz — nhân viên chọn
-- cả ngày lẫn giờ (block 60 phút) khi thêm dòng hàng, thay vì chỉ chọn ngày.
-- "1 ngày thuê" giờ tính đúng 24h kể từ thời điểm bắt đầu (không còn tính
-- theo ngày dương lịch như trước).
-- =============================================================================

alter table public.order_equipment
  rename column rental_start_date to rental_start_at;
alter table public.order_equipment
  rename column rental_end_date to rental_end_at;

alter table public.order_equipment
  alter column rental_start_at type timestamptz using rental_start_at::timestamptz,
  alter column rental_end_at type timestamptz using rental_end_at::timestamptz;

create or replace function public.check_order_equipment_line()
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
    if new.rental_start_at is not null or new.rental_end_at is not null then
      raise exception 'Hàng dịch vụ không có ngày thuê';
    end if;
  elsif v_product_type = 'sale' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng bán phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng bán không dùng sản phẩm riêng lẻ';
    end if;
    if new.rental_start_at is not null or new.rental_end_at is not null then
      raise exception 'Hàng bán không có ngày thuê';
    end if;
  elsif v_product_type = 'rental' and v_tracking_type = 'quantity' then
    if new.equipment_unit_id is null then
      raise exception 'Hàng cho thuê theo số lượng phải chọn biến thể cụ thể';
    end if;
    if new.equipment_instance_id is not null then
      raise exception 'Hàng cho thuê theo số lượng không dùng sản phẩm riêng lẻ';
    end if;
    if new.rental_start_at is null or new.rental_end_at is null then
      raise exception 'Hàng cho thuê phải có ngày giờ bắt đầu và kết thúc thuê';
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
    if new.rental_start_at is null or new.rental_end_at is null then
      raise exception 'Hàng cho thuê phải có ngày giờ bắt đầu và kết thúc thuê';
    end if;
  end if;

  return new;
end;
$$;
