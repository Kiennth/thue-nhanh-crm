-- CEO 2026-08-02: ngừng dùng "iPad Pro M1 11-inch" (theo số lượng, 1 biến
-- thể duy nhất) — chuyển hẳn sang "iPad Pro M1 11-inch (SN)" (theo từng sản
-- phẩm, 2 biến thể Wi-Fi Only / Wi-Fi+5G, đã có 10 máy thật với serial).
--
-- 75 dòng đơn hàng cũ (36 đơn, 33 đã hoàn tất + 3 đang mở) CHƯA TỪNG ghi lại
-- serial nào — hồi đó theo dõi bằng số lượng nên không có cách nào biết
-- CHÍNH XÁC con iPad nào đã đi với đơn nào. CEO xác nhận: chuyển hết sang SP
-- mới, serial nào cũng được (không cần khớp lịch sử) — phân đều 75 dòng vào
-- 10 máy thật theo kiểu round-robin thay vì dồn hết vào 1 máy, để lịch sử
-- thuê từng máy không bị lệch quá đáng.
--
-- Chỉ đổi equipment_type_id + equipment_instance_id — GIỮ NGUYÊN unit_price/
-- line_total (giá đã chốt lúc đặt đơn, không hồi tố theo giá/cọc catalog
-- mới) và quantity (đã luôn =1, đúng yêu cầu của tracking theo serial).
do $$
declare
  v_old_type_id uuid := 'd53ee9ee-eda3-44aa-b9de-8cff3f8eebe0';
  v_new_type_id uuid := 'b62ae8b5-5e8d-47be-86a4-bf5c9b9e058c';
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
      equipment_instance_id = i.id
  from old_lines ol
  join instances i on i.rn = ol.rn % i.total
  where oe.id = ol.id;
end $$;
