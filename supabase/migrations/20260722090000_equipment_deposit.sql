-- Tiền cọc mỗi đơn vị hàng cho thuê — thu cùng lúc với đơn (không tính VAT),
-- hoàn lại sau khi nghiệm thu. Chỉ có ý nghĩa với product_type = 'rental',
-- các loại khác luôn để 0.
alter table public.equipment_types
  add column deposit_amount numeric(14, 2) not null default 0;
