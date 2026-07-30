-- Thêm cột thứ tự hiển thị cho dòng hàng trong đơn (order_equipment), để cho
-- phép kéo thả sắp xếp lại "Danh sách thiết bị" trên trang xem đơn — trước
-- giờ chỉ sắp theo created_at, không sửa thứ tự được.
alter table public.order_equipment add column position integer;

-- Trigger order_equipment_check_line (BEFORE INSERT OR UPDATE) validate lại
-- TOÀN BỘ dòng hàng mỗi lần UPDATE — kể cả khi chỉ đổi position/giá/người
-- thực hiện, không đụng gì tới equipment_type/unit/instance/quantity. Rất
-- nhiều dòng lịch sử (~7000, dữ liệu cũ trước khi bắt buộc chọn biến thể cụ
-- thể) không qua nổi validate này dù bản thân dữ liệu KHÔNG hề đổi — khiến
-- sửa giá/số lượng/người thực hiện/thứ tự trên các dòng đó bị lỗi vô lý.
-- Sửa lại: chỉ validate khi các cột thực sự liên quan tới business rule
-- (equipment_type_id/equipment_unit_id/equipment_instance_id/quantity/
-- order_id) có thay đổi; INSERT luôn validate như cũ.
create or replace function public.check_order_equipment_line()
returns trigger as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
  v_has_rental_period boolean;
begin
  if tg_op = 'UPDATE'
     and new.equipment_type_id is not distinct from old.equipment_type_id
     and new.equipment_unit_id is not distinct from old.equipment_unit_id
     and new.equipment_instance_id is not distinct from old.equipment_instance_id
     and new.quantity is not distinct from old.quantity
     and new.order_id is not distinct from old.order_id
  then
    return new;
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

-- Backfill: giữ nguyên thứ tự hiện tại (theo created_at) làm position ban đầu.
-- Bảng có ~55.000 dòng — tắt tạm trigger recalc tổng tiền (AFTER, chạy lại
-- mỗi dòng) trong lúc backfill vì position không ảnh hưởng total_value, để
-- tránh chạy quá lâu/timeout; bật lại ngay sau khi xong.
alter table public.order_equipment disable trigger order_equipment_recalc_total;

with ranked as (
  select id, row_number() over (partition by order_id order by created_at) as rn
  from public.order_equipment
)
update public.order_equipment oe
set position = ranked.rn
from ranked
where oe.id = ranked.id;

alter table public.order_equipment enable trigger order_equipment_recalc_total;

alter table public.order_equipment alter column position set not null;

-- Dòng hàng mới thêm (thêm dòng, nhân bản đơn...) tự nối vào cuối danh sách
-- của đơn đó nếu không truyền position tường minh.
create or replace function public.set_order_equipment_position()
returns trigger as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1 into new.position
    from public.order_equipment
    where order_id = new.order_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_order_equipment_position
before insert on public.order_equipment
for each row execute function public.set_order_equipment_position();
