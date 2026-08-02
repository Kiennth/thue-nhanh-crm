-- CEO 2026-08-03: ngừng dùng "iPad Air 4 10.9 inch (SL)" (theo số lượng) —
-- chuyển hẳn sang "iPad Air 4 10.9-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+4G, hiện chỉ có 1 máy thật với serial AIR4-SG-01).
--
-- Chỉ 4 dòng đơn hàng cũ (4 đơn, đều đã nhập kho & bảo trì — không có đơn
-- đang mở), toàn bộ quantity = 1. Chỉ có 1 serial thật nên cả 4 dòng dồn về
-- cùng 1 máy — CEO đã xác nhận serial nào cũng được cho các lần chuyển
-- trước, áp dụng tương tự.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 5.000.000đ, mới 1.000.000đ) —
-- khác các lần chuyển trước (luôn giống nhau). Không có đơn nào đang mở
-- trong 4 đơn này nên không ảnh hưởng thực tế, không cần override cọc.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := '053f2ba6-cf1f-4543-aacb-108e7758c03d';
  v_old_unit_id uuid := '569e2a6b-1870-4dec-bd48-b6377f580aa8';
  v_new_type_id uuid := '669095a3-0489-42e5-a477-3dbb778c745f';
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

  -- Mã cũ giờ không còn dòng đơn hàng nào — xoá hẳn khỏi danh mục, kèm 2
  -- bản ghi AUTO-* mồ côi và 2 dòng tồn kho, chưa từng được đơn hàng hay
  -- thẻ RFID nào tham chiếu.
  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_old_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
