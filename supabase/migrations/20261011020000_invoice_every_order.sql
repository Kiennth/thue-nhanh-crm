-- Đơn nào cũng phải xuất hoá đơn (CEO 2026-10-11: "không xuất về cty thì
-- xuất về cá nhân"; "gỡ luật, bỏ hẳn nút"). Gỡ trigger tự "Không cần" cho
-- khách cá nhân không lấy VAT; 7 đơn bị đánh dấu tự động từ 01/10 về lại
-- "Chờ xuất". Đơn "Không cần" đánh dấu tay giữ nguyên (sổ vẫn có Mở lại).
drop trigger if exists orders_auto_invoice_not_needed on public.orders;
drop function if exists public.orders_auto_invoice_not_needed();

do $mig$
declare
  n int;
begin
  update public.orders
  set invoice_not_needed = false,
      invoice_not_needed_reason = null
  where invoice_not_needed
    and invoice_not_needed_reason = 'Khách cá nhân không lấy hoá đơn (tự động)'
    and cancelled_at is null
    and invoice_issued_at is null;
  get diagnostics n = row_count;
  if n <> 7 then
    raise exception 'Mong đợi 7 đơn, thực tế %', n;
  end if;
end;
$mig$;
