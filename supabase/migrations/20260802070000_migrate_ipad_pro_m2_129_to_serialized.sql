-- CEO 2026-08-02: ngừng dùng "iPad Pro M2 12.9-inch (SL)" (theo số lượng, 1
-- biến thể duy nhất) — chuyển hẳn sang "iPad Pro M2 12.9-inch" (theo từng sản
-- phẩm, biến thể Wi-Fi Only / Wi-Fi+5G, đã có 9 máy thật với serial, hiện
-- toàn bộ đang gắn biến thể Wi-Fi + 5G).
--
-- 64 dòng đơn hàng cũ (34 đơn, chưa từng ghi lại serial nào — hồi đó theo
-- dõi bằng số lượng) CEO xác nhận: chuyển hết sang SP mới, serial nào cũng
-- được — phân đều theo kiểu round-robin qua 9 máy thật.
--
-- deposit_amount của cả 2 mã hàng đều là 5.000.000đ (giống hệt nhau) nên
-- không cần override cọc như lần chuyển iPad Pro M1 11-inch trước đó — tiền
-- cọc dự kiến của mọi đơn giữ nguyên tự nhiên sau khi đổi.
--
-- 1 dòng duy nhất có quantity = 4 (đơn hàng chứa 4 máy trong 1 dòng) — mã
-- hàng mới theo dõi từng sản phẩm chỉ cho phép quantity = 1/dòng, nên tách
-- dòng đó thành 4 dòng quantity = 1 (giữ nguyên đơn giá/dòng, tổng thành
-- tiền không đổi) TRƯỚC khi phân bổ serial.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id/quantity
-- — GIỮ NGUYÊN unit_price (giá đã chốt lúc đặt đơn, không hồi tố theo giá
-- catalog mới) và tổng line_total của từng đơn.
do $$
declare
  v_old_type_id uuid := '548cb424-e92f-4ca1-b0f6-f495f8e9ecac';
  v_old_unit_id uuid := '74da2be7-5e0b-483e-9d1c-c7e152d3d8df';
  v_new_type_id uuid := '82975e31-3dda-4adb-bb79-9d5f291fb862';
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

  -- Mã cũ giờ không còn dòng đơn hàng nào — xoá hẳn khỏi danh mục. Kèm theo
  -- là 30 bản ghi "AUTO-IPAD-PRO-M2-12-9-INCH-*" và 3 dòng tồn kho 10/10/10:
  -- tất cả đều là dữ liệu mặc định sinh ra lúc import (147/242 biến thể toàn
  -- hệ thống có đúng mẫu tồn kho 10/10/10 này), chưa từng được đơn hàng hay
  -- thẻ RFID nào tham chiếu — không phải kho thật.
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
