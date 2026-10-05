-- Thông tin giao hàng có cấu trúc trên đơn (CEO 2026-10-05): 3 ô riêng thay
-- cho việc dò địa chỉ/SĐT/tên trong ghi chú dòng phí giao — dùng để xử lý
-- (lịch, lịch làm việc) và điền thẳng vào chứng từ (biên bản giao hàng...).
alter table public.orders
  add column if not exists delivery_address text,
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text;
