-- CEO 2026-08-05: "chuyển DJI Osmo Mobile 4 | 4SE qua CRM mới, quản lý
-- theo số lượng" + "chuyển Webcam Logitech C930E 1080P qua CRM mới, quản
-- lý theo số lượng" — 2 catalog mới, quantity-tracked. Giá theo giá phổ
-- biến nhất trong lịch sử, cọc/tồn kho là ước tính cần rà soát lại.
--   DJI Osmo Mobile 4 | 4SE: 200.000đ/ngày, cọc 800.000đ, tồn kho tạm
--     6/12/3 (HN/HCM/ĐN). 67 dòng mồ côi, 36.995.000đ, 0 đơn mở.
--   Webcam Logitech C930E 1080P: 100.000đ/ngày, cọc 300.000đ, tồn kho tạm
--     3/4/2 (HN/HCM/ĐN). 27 dòng mồ côi, 8.285.000đ, 0 đơn mở.
do $$
declare
  v_type_id uuid;
  v_unit_id uuid;
begin
  insert into public.equipment_types (name, product_type, tracking_type, price, deposit_amount, rental_period_unit, pricing_method)
  values ('DJI Osmo Mobile 4 | 4SE', 'rental', 'quantity', 200000, 800000, 'day', 'flat_fee')
  returning id into v_type_id;
  insert into public.equipment_units (equipment_type_id, brand_model) values (v_type_id, 'DJI Osmo Mobile 4 | 4SE') returning id into v_unit_id;
  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock) values
    (v_unit_id, 'a877af86-9936-4dc2-b257-95bb49026cd0', 6),
    (v_unit_id, '0f39724e-2017-491b-9246-79b64342ed74', 12),
    (v_unit_id, '60d43037-54e8-44e7-ba34-c139712b95b6', 3);
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Tay cầm chống rung DJI Osmo Mobile 4 | 4SE';

  insert into public.equipment_types (name, product_type, tracking_type, price, deposit_amount, rental_period_unit, pricing_method)
  values ('Webcam Logitech C930E 1080P', 'rental', 'quantity', 100000, 300000, 'day', 'flat_fee')
  returning id into v_type_id;
  insert into public.equipment_units (equipment_type_id, brand_model) values (v_type_id, 'Webcam Logitech C930E 1080P') returning id into v_unit_id;
  insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock) values
    (v_unit_id, 'a877af86-9936-4dc2-b257-95bb49026cd0', 3),
    (v_unit_id, '0f39724e-2017-491b-9246-79b64342ed74', 4),
    (v_unit_id, '60d43037-54e8-44e7-ba34-c139712b95b6', 2);
  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_unit_id = v_unit_id
  where custom_name = 'Webcam Logitech C930E 1080P';
end $$;
