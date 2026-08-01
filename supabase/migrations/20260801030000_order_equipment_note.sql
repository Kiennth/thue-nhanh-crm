-- Ghi chú tự do cho dòng hàng — CEO cần chỗ ghi địa chỉ + SĐT nhận/trả hàng
-- ngay trên 4 dòng phí vận chuyển (giao/thu hồi bằng xe máy hoặc ô tô).
alter table public.order_equipment add column note text;

comment on column public.order_equipment.note is
  'Ghi chú tự do — hiện dùng cho 4 dòng phí vận chuyển (giao/thu hồi bằng xe máy hoặc ô tô) để ghi địa chỉ + SĐT nhận/trả hàng.';
