-- CEO 2026-08-03: ngừng dùng "iPad Gen 9 10.2-inch (SL)" (theo số lượng) —
-- chuyển hẳn sang "iPad Gen 9 10.2-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+4G, hiện có 19 máy thật: IPAD-GEN9-HN-01..09,
-- IPAD-GEN9-SG-01..19... thực tế 19 máy tổng).
--
-- 665 dòng đơn hàng cũ (185 đơn — 5 đơn đang mở: BQ12068, BQ12037,
-- BQ11942, BQ11978, BQ11612). 1 dòng duy nhất có quantity = 10 (thuộc
-- BQ11978) được tách thành 10 dòng quantity = 1 vì mã theo dõi riêng lẻ
-- chỉ cho phép 1 sản phẩm/dòng — tổng tiền không đổi.
--
-- deposit_amount của cả 2 mã hàng đều là 1.000.000đ (giống hệt nhau) nên
-- không cần override cọc — tiền cọc dự kiến của mọi đơn (kể cả 5 đơn đang
-- mở) giữ nguyên tự nhiên sau khi đổi.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id/
-- quantity — GIỮ NGUYÊN unit_price và tổng line_total của từng đơn.
do $$
declare
  v_old_type_id uuid := '504f045c-1f45-4cbb-9b4b-a1274aeb6ca6';
  v_old_unit_id uuid := '39e377ed-7429-4068-944b-ff48f1d311e0';
  v_new_type_id uuid := '420914bd-bcb9-4677-8f54-0a677483bf1a';
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
