-- CEO 2026-08-04: nhiều biến thể (hãng/model) của cùng 1 sản phẩm có giá
-- thuê khác nhau trên thực tế (vd Smart TV nhiều hãng, Xe Scooter Điện
-- nhiều dòng) nhưng equipment_types.price chỉ có 1 giá dùng chung cho mọi
-- biến thể. Thêm giá riêng (tuỳ chọn) ở cấp biến thể — null nghĩa là vẫn
-- dùng giá sản phẩm chung như trước, không phá vỡ dữ liệu cũ.
alter table public.equipment_units
  add column price numeric;

comment on column public.equipment_units.price is
  'Giá thuê riêng cho biến thể này (đơn vị theo equipment_types.rental_period_unit) — null = dùng equipment_types.price.';
