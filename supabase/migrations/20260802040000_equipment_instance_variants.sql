-- Cho phép hàng serialize (tracking_type='individual') cũng có "biến thể"
-- (equipment_units) — CEO 2026-08-02: một số sản phẩm cùng tên nhưng khác
-- cấu hình bán hàng thật (VD iPad Pro 11-inch Wi-Fi vs Wi-Fi+5G) cần phân
-- biệt bằng biến thể, dù mỗi máy vẫn có serial riêng của nó.
--
-- Trước đây trigger equipment_units_check_tracking CHẶN CỨNG việc gắn biến
-- thể vào hàng individual (chỉ cho sale/quantity) — nới ra để equipment_units
-- trở thành lớp biến thể DÙNG CHUNG cho cả 2 kiểu theo dõi.
create or replace function public.check_equipment_unit_tracking()
returns trigger
language plpgsql
as $$
declare
  v_product_type public.product_type;
begin
  select product_type into v_product_type
  from public.equipment_types where id = new.equipment_type_id;

  if v_product_type is null then
    raise exception 'Không tìm thấy loại hàng hoá';
  end if;

  return new;
end;
$$;

-- Biến thể là TUỲ CHỌN cho hàng serialize — khác hẳn hàng quantity/sale (bắt
-- buộc phải có unit vì tồn kho bám theo unit). Máy hiện có (VD 18 máy PS5
-- thật) không cần gán lại, vẫn hoạt động y nguyên không có biến thể; chỉ
-- điền equipment_unit_id khi loại hàng thật sự có nhiều cấu hình khác nhau.
alter table public.equipment_instances
  add column equipment_unit_id uuid references public.equipment_units(id) on delete set null;

comment on column public.equipment_instances.equipment_unit_id is
  'Biến thể (tuỳ chọn) của máy này — null nghĩa là loại hàng chưa cần phân biến thể, mỗi serial vẫn độc lập như trước.';
