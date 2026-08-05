-- CEO 2026-08-05: "chuyển DJI Osmo Mobile 5 qua CRM mới nhé, quản lý theo
-- số lượng" — tạo mới catalog (chưa có), quantity-tracked. Giá 250.000đ/
-- ngày (giá phổ biến nhất trong 68 dòng lịch sử), cọc 1.000.000đ (ước
-- tính, cần kho xác nhận lại). Tồn kho tạm theo peak trùng lịch quan sát
-- được (HN 1, HCM 4) + dư ra chút: 3/6/3 theo Hà Nội/TP HCM/Đà Nẵng — số
-- CẦN RÀ SOÁT LẠI, không phải kiểm kê thật. 68 dòng order_equipment mồ
-- côi, 27.182.000đ, 0 đơn đang mở.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  insert into public.equipment_types (name, product_type, tracking_type, price, deposit_amount, rental_period_unit, pricing_method)
  values ('DJI Osmo Mobile 5', 'rental', 'quantity', 250000, 1000000, 'day', 'flat_fee')
  returning id into v_type_id;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (v_type_id, 'DJI Osmo Mobile 5')
  returning id into v_unit_id;

  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
  values
    (v_unit_id, 'a877af86-9936-4dc2-b257-95bb49026cd0', 3),
    (v_unit_id, '0f39724e-2017-491b-9246-79b64342ed74', 6),
    (v_unit_id, '60d43037-54e8-44e7-ba34-c139712b95b6', 3);

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Tay cầm chống rung DJI Osmo Mobile 5';
end $$;
