-- Dịch vụ tính theo giờ (CEO 2026-10-06, học Booqable): "Phí dịch vụ hỗ trợ kỹ
-- thuật | On site support" chọn số giờ thực hiện → tiền = giá/giờ × số giờ ×
-- SL. Cho phép product_type='service' có rental_period_unit (null = trọn gói
-- như cũ); hàng bán (sale) vẫn không có đơn vị. Số giờ ghi ở
-- order_equipment.charge_duration (cùng cột "số kỳ tính tiền" của hàng thuê).
alter table public.equipment_types
  drop constraint equipment_types_type_consistency;

alter table public.equipment_types
  add constraint equipment_types_type_consistency check (
    (
      product_type = 'rental'
      and tracking_type is not null
      and pricing_method is not null
      and rental_period_unit is not null
    )
    or
    (
      product_type = 'service'
      and tracking_type is null
      and pricing_method is null
      and pricing_template_id is null
    )
    or
    (
      product_type = 'sale'
      and tracking_type is null
      and pricing_method is null
      and rental_period_unit is null
      and pricing_template_id is null
    )
  );

update public.equipment_types
set rental_period_unit = 'hour'
where product_type = 'service'
  and name in ('Phí dịch vụ hỗ trợ kỹ thuật | On site support', 'Phĩ hỗ trợ kĩ thuật (h)');
