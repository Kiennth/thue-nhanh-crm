-- CEO 2026-08-04: "Bộ ghế lái xe hơi giả lập - Ghế + TV 65inch 4K chính là
-- Bộ ghế Lái Xe Hơi Giả Lập + biến thể kèm TV 4k 65 inch" +
-- "Bộ ghế lái xe hơi giả lập - Ghế không kèm màn hình chính là Bộ ghế Lái
-- Xe Hơi Giả Lập + Biến thể không kèm Màn Hình" — 31 dòng order_equipment
-- mồ côi (13 + 18), tổng 138.824.000đ, 0 đơn đang mở nên không cần đóng
-- băng cọc. Quantity-tracked, cả 2 unit biến thể đã có sẵn — chỉ cần gắn.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'Bộ ghế Lái Xe Hơi Giả Lập';
  if v_type_id is null then
    return;
  end if;

  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'kèm TV 4k 65 inch';
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Bộ ghế lái xe hơi giả lập - Ghế + TV 65inch 4K';

  select id into v_unit_id from public.equipment_units
  where equipment_type_id = v_type_id and brand_model = 'không kèm Màn Hình';
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Bộ ghế lái xe hơi giả lập - Ghế không kèm màn hình';
end $$;
