-- CEO 2026-08-03: ngừng dùng "Meta Quest 2 (SL)" (theo số lượng) — chuyển
-- hẳn sang "Meta Quest 2" (theo từng sản phẩm, hiện có 15 máy thật:
-- Q2-HN-01..07, Q2-SG-01..08).
--
-- 1484 dòng đơn hàng cũ (515 đơn — 1 đơn đang mở BQ12016, đang vận hành/xử
-- lý sự cố), toàn bộ quantity = 1. deposit_amount 2 mã GIỐNG NHAU
-- (1.000.000đ) nên không cần override cọc.
--
-- LƯU Ý: đây là mã có nhiều dòng nhất từ trước đến nay (1484) — vượt giới
-- hạn 1000 dòng/lần gọi mặc định của PostgREST, phải phân trang khi đọc dữ
-- liệu để tránh sót 484 dòng cuối (đã xác nhận qua Prefer: count=exact
-- trước khi chạy).
--
-- Chỉ đổi equipment_type_id/equipment_unit_id/equipment_instance_id — GIỮ
-- NGUYÊN unit_price/line_total/quantity.
do $$
declare
  v_old_type_id uuid := 'ec8a8d9f-c707-4035-845a-11763f2012f8';
  v_old_unit_id uuid := '69e4b3dc-5c93-4caa-892b-37824b9731ef';
  v_new_type_id uuid := '4deb471f-e288-4d5a-8bcf-44765c2d1452';
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
