-- =============================================================================
-- Thêm trạng thái "Đã huỷ" cho đơn hàng — song song với completed_at, không
-- đụng vào task_type/10 khâu tính khoán. Một đơn chỉ được ở 1 trong 2 trạng
-- thái kết thúc (hoàn tất HOẶC huỷ), không được cả hai cùng lúc.
-- =============================================================================

alter table public.orders
  add column cancelled_at timestamptz;

alter table public.orders
  add constraint orders_not_completed_and_cancelled
  check (completed_at is null or cancelled_at is null);
