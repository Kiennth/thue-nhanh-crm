-- CEO 2026-10-05: số đơn mới có tiền tố PO — PO13111, PO13112… (cùng
-- sequence order_number_seq, chưa đơn nào dùng số thuần).
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
    v_code := 'PO' || nextval('public.order_number_seq')::text;
    exit when not exists (select 1 from public.orders where order_code = v_code);
  end loop;
  return v_code;
end;
$$;
