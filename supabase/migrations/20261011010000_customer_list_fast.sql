-- Trang Khách hàng tải chậm (~5 giây, CEO 2026-10-11): customer_page_list
-- chạy trong hàm dùng plan dùng chung (generic plan) — điều kiện "khách có
-- đơn ở chi nhánh" quét lại CTE scoped (11k đơn) cho TỪNG khách (5,5k) →
-- 8,5 giây. Đổi sang tra thẳng orders qua index orders_customer_id_idx →
-- 0,1 giây, kết quả y hệt. Giữ nguyên phần còn lại của hàm (vá tại chỗ).
do $mig$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.customer_page_list(uuid, text, text, text, integer, integer, text)'::regprocedure);
  if position('exists (select 1 from scoped s2 where s2.customer_id = c.id)' in v_def) = 0 then
    raise exception 'Không thấy đoạn cần vá trong customer_page_list';
  end if;
  v_def := replace(v_def,
    'exists (select 1 from scoped s2 where s2.customer_id = c.id)',
    'exists (select 1 from public.orders o2
                 where o2.customer_id = c.id and o2.cancelled_at is null
                   and (o2.pickup_branch_id = (select branch_id from effective)
                        or o2.return_branch_id = (select branch_id from effective)))');
  execute v_def;
end;
$mig$;
