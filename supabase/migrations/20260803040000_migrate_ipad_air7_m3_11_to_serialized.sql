-- CEO 2026-08-03: ngừng dùng "iPad Air 7 M3 11 inch" (theo số lượng) —
-- chuyển hẳn sang "iPad Air 7 M3 11-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+5G, hiện có 8 máy thật: Air7-HN-01..04, Air7-SG-01..04).
--
-- 23 dòng đơn hàng cũ (16 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (5.000.000đ) nên không cần override cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := '4066b29e-bee3-4a93-8324-a471c8b894d5';
  v_old_unit_id uuid := 'b9d9d0df-a6ef-419d-861a-634d45c2648e';
  v_new_type_id uuid := '6614a67b-650d-41a9-8434-a7f2ec480a2c';
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
