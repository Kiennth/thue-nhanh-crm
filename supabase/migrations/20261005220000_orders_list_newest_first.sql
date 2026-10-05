-- Danh sách đơn (CEO 2026-10-05): đơn mới tạo gần nhất lên đầu — mặc định
-- xếp order_date giảm dần, cùng ngày thì created_at giảm dần (trước là id
-- uuid → thứ tự gần như ngẫu nhiên trong ngày). Vá thẳng định nghĩa đang
-- chạy của orders_page_list (đã áp qua SQL editor).
do $do$
declare
  f oid;
  d text;
  n text;
begin
  select p.oid into strict f from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'orders_page_list';
  d := pg_get_functiondef(f);
  n := replace(d, 'o.completed_at, o.cancelled_at, o.delivered_at,', 'o.completed_at, o.cancelled_at, o.delivered_at, o.created_at,');
  n := replace(n, 'then id end desc', 'then created_at end desc');
  if n = d or position('o.created_at' in n) = 0 or position('then created_at end desc' in n) = 0 then
    raise exception 'Không tìm thấy chỗ cần sửa';
  end if;
  execute n;
end
$do$;
