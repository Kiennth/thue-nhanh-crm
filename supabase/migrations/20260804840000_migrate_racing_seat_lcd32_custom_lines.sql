-- CEO 2026-08-04: "Bộ ghế lái xe hơi giả lập - Ghế + LCD 32inch 4K chính
-- là sản phẩm Bộ ghế Lái Xe Hơi Giả Lập với biến thể kèm Màn Hình 4K 32
-- inch" — 48 dòng order_equipment mồ côi, 371.275.000đ (khoản mồ côi lớn
-- nhất trong đợt quét), 0 đơn đang mở nên không cần đóng băng cọc. Type
-- này là quantity-tracked nên chỉ cần gắn equipment_unit_id vào unit biến
-- thể có sẵn, không cần tách dòng/tạo instance.
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
  where equipment_type_id = v_type_id and brand_model = 'kèm Màn Hình 4K 32 inch';

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Bộ ghế lái xe hơi giả lập - Ghế + LCD 32inch 4K';
end $$;
