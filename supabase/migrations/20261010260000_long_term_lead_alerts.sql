-- Chuông "Thông báo việc": thêm lead Thuê dài hạn từ web (CEO 2026-10-10
-- "thêm chuông báo lead Dài hạn trong CRM"). Giữ nguyên phần khâu + hoá đơn.
create or replace function public.my_task_alerts()
returns jsonb
language sql
stable
set search_path = public
as $$
with me as (
  select id, role, branch_id from public.employees where user_id = auth.uid() and is_active
),
t as (select * from public.open_step_tasks()),
steps as (
  select t.order_id, t.order_code, t.task_type::text as task_type, t.due_at, t.customer_name,
         'overdue'::text as kind, t.assignee_id = (select id from me) as mine
  from t
  where t.due_at < now()
    and (t.assignee_id = (select id from me)
         or ((select role from me) = 'cua_hang_truong' and t.branch_id = (select branch_id from me)))
  union all
  select t.order_id, t.order_code, t.task_type::text, t.due_at, t.customer_name, 'soon', true
  from t
  where t.due_at >= now() and t.due_at < now() + interval '1 hour'
    and t.assignee_id = (select id from me)
),
inv as (
  select o.id as order_id, o.order_code, 'invoice'::text as task_type,
         o.completed_at + interval '24 hours' as due_at, c.name as customer_name,
         case when (select role from me) = 'giam_doc' then 'invoice_late' else 'invoice_due' end as kind,
         true as mine
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where (select role from me) in ('ke_toan', 'giam_doc')
    and o.completed_at >= '2026-10-01'
    and o.cancelled_at is null and o.invoice_issued_at is null and not o.invoice_not_needed
    and o.completed_at < now() - case when (select role from me) = 'giam_doc' then interval '3 days' else interval '24 hours' end
),
-- Lead "Thuê dài hạn" từ web (datepricebox v2.2, CEO 10/10): báo Giám đốc +
-- Admin (ai mở được sổ Khách hỏi thuê) trong 7 ngày kể từ lúc khách gửi.
-- orderId = id lead, orderCode = tên khách, customerName = SĐT.
lead as (
  select l.id as order_id, l.name as order_code, 'lead'::text as task_type,
         l.created_at as due_at, l.phone as customer_name,
         'lead_long'::text as kind, true as mine
  from public.website_leads l
  where (select role from me) in ('giam_doc', 'admin')
    and l.message like '[Dài hạn]%'
    and l.created_at > now() - interval '7 days'
),
k as (
  select a.*, a.order_id::text || ':' || a.task_type || ':' || a.kind || ':'
              || extract(epoch from a.due_at)::bigint::text as alert_key
  from (select * from steps union all select * from inv union all select * from lead) a
)
select jsonb_build_object(
  'myDue', (select count(*) from t
            where t.assignee_id = (select id from me)
              and t.due_at < ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'),
  'alerts', (select coalesce(jsonb_agg(jsonb_build_object(
      'key', k.alert_key, 'orderId', k.order_id, 'orderCode', k.order_code, 'taskType', k.task_type,
      'dueAt', k.due_at, 'kind', k.kind, 'mine', k.mine, 'customerName', k.customer_name,
      'seen', exists (select 1 from public.task_alert_seen s
                      where s.employee_id = (select id from me) and s.alert_key = k.alert_key)
    ) order by k.due_at desc), '[]'::jsonb) from k)
);
$$;

notify pgrst, 'reload schema';
