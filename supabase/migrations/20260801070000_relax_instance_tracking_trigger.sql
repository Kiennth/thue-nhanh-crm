-- Sửa GỐC chuỗi lỗi kẹt tồn kho (BQ11779, BQ12071): trigger
-- equipment_instances_check_tracking chặn MỌI update trên máy thuộc loại
-- hàng không phải (rental + individual) — kể cả update chỉ đổi status/
-- branch_id trong luồng giao/thu hồi đơn. 81 loại hàng cũ bị đổi
-- tracking_type sang 'quantity' mà vẫn còn máy nằm trong equipment_instances
-- (lỗi dữ liệu có từ trước), nên deliver_order_stock/return_order_stock đụng
-- máy của các loại đó là chết cả transaction — đơn nào thuê các loại này đều
-- sẽ kẹt "Đang cho thuê" hoặc không trừ được kho.
--
-- Nới trigger: chỉ validate khi TẠO MỚI máy hoặc ĐỔI loại hàng của máy —
-- đúng mục đích ban đầu của nó (chặn gắn máy vào loại sai chỗ), còn update
-- vận hành (status, branch_id, ghi chú...) trên máy có sẵn thì cho qua.
create or replace function public.check_equipment_instance_tracking()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
  v_tracking_type public.tracking_type;
begin
  if tg_op = 'UPDATE' and new.equipment_type_id = old.equipment_type_id then
    return new;
  end if;

  select product_type, tracking_type into v_product_type, v_tracking_type
  from public.equipment_types where id = new.equipment_type_id;

  if not (v_product_type = 'rental' and v_tracking_type = 'individual') then
    raise exception 'equipment_instances chỉ áp dụng cho hàng cho thuê theo dõi riêng lẻ';
  end if;

  return new;
end;
$$;

-- Bù dữ liệu BQ12071 — đơn ĐANG thuê (đã tick "Giao hàng & bàn giao" lúc
-- import Booqable 2026-07-24 nhưng deliver_order_stock chết vì trigger trên):
-- 5 máy Samsung S21 | S21 FE đang ở khách mà hệ thống vẫn ghi "Sẵn có".
-- Đưa về đúng thực tế: máy sang "Đang cho thuê" + đánh dấu đã trừ kho, để
-- khi thu hồi tick "Nhập kho & bảo trì" luồng trả kho chạy đúng chuẩn.
update public.equipment_instances
  set status = 'rented'
  where id in (
    '10ef970c-1531-4a48-941f-6e7d55664304',
    '40e64de9-74f6-404b-86e8-a60372cfca32',
    '7d98b4aa-6d5a-4ce7-ac6a-182927dded51',
    'e1a18019-be16-436c-8b99-2491ea5f10f1',
    '93251b68-ff48-4e03-8a31-da4d6b6a4294'
  );

update public.orders
  set delivery_stock_moved_at = now()
  where order_code = 'BQ12071' and delivery_stock_moved_at is null;
