-- CEO 2026-08-03: ngừng dùng "iPad Air 6 M2 13 inch" (theo số lượng) —
-- chuyển hẳn sang "iPad Air 6 M2 13-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+5G, hiện có 2 máy thật: AIR-M2-13-HN-01, AIR-M2-13-SG-01).
--
-- 18 dòng đơn hàng cũ (13 đơn — 12 đã nhập kho & bảo trì, 1 đơn BQ12141
-- đang vận hành/xử lý sự cố), toàn bộ quantity = 1. deposit_amount 2 mã
-- GIỐNG NHAU (5.000.000đ) nên đơn đang mở không bị ảnh hưởng cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := 'ee2ee5fd-d0ca-4654-a1cb-b8b140e51e4f';
  v_old_unit_id uuid := '7a972b8c-acc9-4218-a999-ba99fa6e0754';
  v_new_type_id uuid := '56081e9e-7675-48d1-bd05-c68f0aba8391';
begin
  with old_lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment
    where equipment_type_id = v_old_type_id
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn,
           count(*) over () as total
    from public.equipment_instances
    where equipment_type_id = v_new_type_id
  )
  update public.order_equipment oe
  set equipment_type_id = v_new_type_id,
      equipment_unit_id = null,
      equipment_instance_id = i.id
  from old_lines ol
  join instances i on i.rn = ol.rn % i.total
  where oe.id = ol.id;

  -- Mã cũ giờ không còn dòng đơn hàng nào — xoá hẳn khỏi danh mục, kèm các
  -- bản ghi AUTO-* mồ côi và dòng tồn kho, chưa từng được đơn hàng hay thẻ
  -- RFID nào tham chiếu.
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
