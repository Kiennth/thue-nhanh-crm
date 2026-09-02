-- CEO 2026-09-02: kế toán cần biết đơn nào đã kết thúc để xuất hoá đơn đỏ.
-- Sổ "Chờ xuất hoá đơn" (/invoices): đơn HOÀN TẤT đủ 10 khâu tự vào danh
-- sách chờ; kế toán bấm "Đã xuất" (lưu số HĐ + ngày) hoặc "Không cần"
-- (khách lẻ không lấy hoá đơn). Trạng thái suy ra từ 3 cột — không thêm
-- enum/trigger:
--   chờ xuất  = completed_at có + invoice_issued_at null + not_needed false
--   đã xuất   = invoice_issued_at có
--   không cần = invoice_not_needed = true
alter table public.orders add column if not exists invoice_issued_at timestamptz;
alter table public.orders add column if not exists invoice_number text;
alter table public.orders add column if not exists invoice_not_needed boolean not null default false;

-- Backfill: ~10.000 đơn lịch sử hoàn tất trước 09/2026 đã xử lý hoá đơn
-- bên Booqable/sổ cũ — đánh "không cần" để danh sách chờ chỉ còn việc
-- thật từ ngày cắt Booqable. Cần xuất bù đơn cũ thì kế toán bấm "Mở lại"
-- từng đơn.
update public.orders
set invoice_not_needed = true
where completed_at is not null
  and completed_at < '2026-09-01T00:00:00+07:00'
  and invoice_issued_at is null;
