-- CEO 2026-08-03: ngừng dùng "iPad Mini 5 7.9 inch" (theo số lượng) —
-- chuyển hẳn sang "iPad Mini 5 7.9-inch" (theo từng sản phẩm, biến thể
-- Wi-Fi Only / Wi-Fi+4G, hiện có 6 máy thật: Mini-5-HN-01..03, Mini-5-SG-01..03).
--
-- 20 dòng đơn hàng cũ (14 đơn — 13 đã nhập kho & bảo trì, 1 đơn BQ11978
-- đang chuẩn bị), toàn bộ quantity = 1.
--
-- LƯU Ý: deposit_amount 2 mã KHÁC NHAU (cũ 2.000.000đ, mới 0đ) — CEO đã
-- xác nhận chấp nhận đơn BQ11978 giảm cọc dự kiến từ 2tr xuống 0đ theo
-- đúng catalog SKU mới.
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := 'a0c27457-7e30-4614-a916-b77a9703543c';
  v_old_unit_id uuid := 'f05ded30-c752-4965-a9b0-c2cc82ecf1e8';
  v_new_type_id uuid := 'dd014be2-6605-415c-b071-8e4bc51200fd';
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
