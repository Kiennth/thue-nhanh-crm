-- CEO 2026-08-03: ngừng dùng "Meta Quest 3S (SL)" (theo số lượng) —
-- chuyển hẳn sang "Meta Quest 3S" (theo từng sản phẩm, hiện có 25 máy
-- thật: Q3S-HN-01..10, Q3S-SG-01..15).
--
-- 372 dòng đơn hàng cũ (101 đơn — 3 đơn đang mở: BQ12084, BQ12066,
-- BQ11910). 1 dòng duy nhất có quantity = 5 (thuộc BQ12084) được tách
-- thành 5 dòng quantity = 1 vì mã theo dõi riêng lẻ chỉ cho phép 1 sản
-- phẩm/dòng — tổng tiền không đổi.
--
-- deposit_amount của cả 2 mã hàng đều là 2.000.000đ (giống hệt nhau) nên
-- không cần override cọc — tiền cọc dự kiến của mọi đơn (kể cả 3 đơn đang
-- mở) giữ nguyên tự nhiên sau khi đổi.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id/
-- quantity — GIỮ NGUYÊN unit_price và tổng line_total của từng đơn.
do $$
declare
  v_old_type_id uuid := '63c3dc20-6649-4a34-8946-2c2f9d70b763';
  v_old_unit_id uuid := 'e6a42b07-f70d-4331-a08e-3110b5b8a2e6';
  v_new_type_id uuid := '8e589a79-58e4-4f9a-876c-87e2fb3150ff';
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
