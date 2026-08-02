-- CEO 2026-08-03: ngừng dùng "iPad Gen 11 A16 11 inch" (theo số lượng) —
-- chuyển hẳn sang "iPad Gen 11 A16 11-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+5G, hiện có 2 máy thật: iPad-A16-SG-01, iPad-A16-SG-02).
--
-- 19 dòng đơn hàng cũ (13 đơn — 12 đã nhập kho & bảo trì, 1 đơn BQ12110
-- đang chuẩn bị). 1 dòng duy nhất có quantity = 2 (thuộc đúng BQ12110) được
-- tách thành 2 dòng quantity = 1 vì mã theo dõi riêng lẻ chỉ cho phép 1
-- sản phẩm/dòng — tổng tiền không đổi.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 3.000.000đ, mới 0đ) — CEO đã
-- xác nhận chấp nhận đơn BQ12110 giảm cọc dự kiến từ 3tr xuống 0đ theo
-- đúng catalog SKU mới.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id/
-- quantity — GIỮ NGUYÊN unit_price và tổng line_total của từng đơn.
do $$
declare
  v_old_type_id uuid := '527f5aa9-ad1c-464e-a154-babb8a5108e5';
  v_old_unit_id uuid := '192f09b9-683e-42c1-9c11-7b8622251502';
  v_new_type_id uuid := '07e9b9ed-27a6-41c4-9861-810d4f1df80e';
  v_multi record;
  i integer;
begin
  for v_multi in
    select id, order_id, quantity, unit_price
    from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment
    set quantity = 1, line_total = v_multi.unit_price
    where id = v_multi.id;

    for i in 2..v_multi.quantity loop
      insert into public.order_equipment
        (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values
        (v_multi.order_id, v_old_type_id, v_old_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

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
