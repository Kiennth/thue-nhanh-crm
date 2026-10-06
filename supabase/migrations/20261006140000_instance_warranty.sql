-- Ngày hết hạn bảo hành từng máy (CEO 2026-10-06: "khá là quan trọng").
-- Nhập ở hộp sửa máy hoặc hàng loạt qua bảng kiểm kho; trang mã hàng tô màu
-- máy sắp hết / đã hết bảo hành.
alter table public.equipment_instances
  add column if not exists warranty_expires_on date;

comment on column public.equipment_instances.warranty_expires_on is
  'Ngày hết hạn bảo hành của máy (null = chưa nhập / không bảo hành)';
