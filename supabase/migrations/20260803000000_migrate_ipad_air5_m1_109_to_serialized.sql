-- CEO 2026-08-03: ngừng dùng "iPad Air 5 M1 10.9 inch - Wi-Fi Only" (theo số
-- lượng, 1 biến thể duy nhất) — chuyển hẳn sang "iPad Air 5 M1 10.9-inch"
-- (theo từng sản phẩm, biến thể Wi-Fi Only / Wi-Fi+5G, hiện có 2 máy thật
-- với serial: F7140GQ7G0, H9NVJ140D7, cả 2 đều gắn biến thể Wi-Fi Only).
--
-- 65 dòng đơn hàng cũ (36 đơn, tất cả đã ở trạng thái nhập kho & bảo trì —
-- không có đơn đang mở, chưa từng ghi lại serial nào) CEO xác nhận: chuyển
-- hết sang SP mới, serial nào cũng được — phân đều theo kiểu round-robin
-- qua 2 máy thật. Toàn bộ dòng đều có quantity = 1 sẵn nên không cần tách.
--
-- deposit_amount của cả 2 mã hàng đều là 5.000.000đ (giống hệt nhau) nên
-- không cần override cọc — tiền cọc dự kiến của mọi đơn giữ nguyên tự nhiên
-- sau khi đổi.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total (giá đã chốt lúc đặt đơn, không hồi tố theo
-- giá catalog mới) và quantity.
do $$
declare
  v_old_type_id uuid := '75a23d77-5f65-4a3a-965f-3cdbfb101af3';
  v_old_unit_id uuid := '7e992fce-0407-4c64-afd1-c4eb86aecb97';
  v_new_type_id uuid := '65362030-86fc-49da-a92c-16bf765d22fa';
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

  -- Mã cũ giờ không còn dòng đơn hàng nào — xoá hẳn khỏi danh mục. Kèm theo
  -- là các bản ghi "AUTO-IPAD-AIR-5-M1-10-9-INCH-*" và 3 dòng tồn kho
  -- 10/10/10 — đều là dữ liệu mặc định sinh ra lúc import, chưa từng được
  -- đơn hàng hay thẻ RFID nào tham chiếu — không phải kho thật.
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
