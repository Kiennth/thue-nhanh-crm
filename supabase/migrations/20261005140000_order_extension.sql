-- Gia hạn đơn (CEO 2026-10-05): đơn gia hạn nối tiếp trỏ về đơn gốc. Máy vẫn
-- ở chỗ khách: đơn gốc đánh dấu đã "thu về" (return_stock_transferred_at)
-- nhưng KHÔNG cộng kho, đơn gia hạn đánh dấu đã "xuất" (delivery_stock_moved_at)
-- nhưng KHÔNG trừ kho — tồn kho chỉ cộng lại khi đơn gia hạn nhập kho thật.
alter table public.orders add column if not exists extended_from_order_id uuid references public.orders(id) on delete set null;
create index if not exists orders_extended_from_idx on public.orders (extended_from_order_id);
