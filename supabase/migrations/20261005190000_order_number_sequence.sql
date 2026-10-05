-- Số đơn nối tiếp Booqable (CEO 2026-10-05): ngưng tạo đơn trên Booqable,
-- CRM đánh số liên tục 13111, 13112… (Booqable dừng ở 13110 — 13108–13110 là
-- đơn nháp chưa đồng bộ). Đơn đồng bộ từ BQ giữ mã "BQxxxxx"; 47 đơn CRM cũ
-- giữ mã DHyyyymmdd-xxx (có thể đã gửi QR/báo giá cho khách).
create sequence if not exists public.order_number_seq start with 13111;

-- Cấp số kế tiếp, bỏ qua số đã bị dùng tay (order_code unique).
create or replace function public.next_order_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_employee() then
    raise exception 'Không có quyền';
  end if;
  loop
    v_code := nextval('public.order_number_seq')::text;
    exit when not exists (select 1 from public.orders where order_code = v_code);
  end loop;
  return v_code;
end;
$$;

grant execute on function public.next_order_code() to authenticated;
