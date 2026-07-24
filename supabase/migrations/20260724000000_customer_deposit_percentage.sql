-- =============================================================================
-- Tỉ lệ tiền cọc theo khách hàng — mặc định 100%, có thể hạ xuống 50% hoặc 0%
-- cho khách thân thiết (không cần đóng cọc). Áp vào tiền cọc tính trên đơn
-- hàng (order detail page), không ảnh hưởng doanh số/VAT.
-- =============================================================================

alter table public.customers
  add column deposit_percentage smallint not null default 100
    check (deposit_percentage in (0, 50, 100));
