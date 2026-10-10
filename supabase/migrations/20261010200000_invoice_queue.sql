-- Hàng đợi hoá đơn (Grok tách gọn CRM 10/10, giai đoạn 5). Giữ mô hình 3 cột
-- cũ (migration 20260902120000) để danh sách đơn / Hôm nay / chip "Chờ HĐ"
-- không phải đổi — chỉ thêm:
--   invoice_needed           — đơn cần HĐ hay không (null = theo khách)
--   invoice_not_needed_reason — "Không cần" bắt buộc lý do (từ nay)
--   invoice_draft_at          — kế toán đã soạn nháp (trên MISA hoặc sổ tay)
-- Trạng thái: Chưa xuất → Nháp → Đã xuất, hoặc Không cần.
-- MISA meInvoice để sau (CEO 10/10), nhắc việc chỉ trong CRM (chuông).

alter table public.orders
  add column if not exists invoice_needed boolean,
  add column if not exists invoice_not_needed_reason text,
  add column if not exists invoice_draft_at timestamptz;

-- Mặc định cần HĐ: khách Công ty, hoặc khách lấy VAT (wants_vat). Khách cá
-- nhân không lấy VAT → tự "Không cần" lúc đơn hoàn tất, có lý do; kế toán
-- bấm "Mở lại" nếu khách đổi ý. Đơn đặt invoice_needed tay thì theo đơn.
create or replace function public.orders_auto_invoice_not_needed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_needed boolean;
begin
  if new.completed_at is null
     or (tg_op = 'UPDATE' and old.completed_at is not null)
     or new.invoice_issued_at is not null
     or new.invoice_not_needed then
    return new;
  end if;
  v_needed := coalesce(
    new.invoice_needed,
    (select c.customer_type = 'company' or c.wants_vat from public.customers c where c.id = new.customer_id),
    true
  );
  if not v_needed then
    new.invoice_not_needed := true;
    new.invoice_not_needed_reason := coalesce(new.invoice_not_needed_reason,
      case when new.invoice_needed = false then 'Đơn đánh dấu không cần hoá đơn'
           else 'Khách cá nhân không lấy hoá đơn (tự động)' end);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_auto_invoice_not_needed on public.orders;
create trigger orders_auto_invoice_not_needed
  before insert or update of completed_at on public.orders
  for each row execute function public.orders_auto_invoice_not_needed();

-- Áp quy tắc cho đơn đang chờ xuất (10/10: 7 đơn khách cá nhân).
update public.orders o
set invoice_not_needed = true,
    invoice_not_needed_reason = 'Khách cá nhân không lấy hoá đơn (tự động)'
from public.customers c
where c.id = o.customer_id
  and o.completed_at is not null and o.cancelled_at is null
  and o.invoice_issued_at is null and not o.invoice_not_needed
  and o.invoice_needed is null
  and c.customer_type = 'individual' and not c.wants_vat;

-- Chuông: thêm nhắc hoá đơn — Kế toán khi đơn chờ xuất quá hạn (hoàn tất +
-- 24h), Giám đốc khi quá 3 ngày. Mỗi đơn 1 thông báo cho mỗi mức.
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
k as (
  select a.*, a.order_id::text || ':' || a.task_type || ':' || a.kind || ':'
              || extract(epoch from a.due_at)::bigint::text as alert_key
  from (select * from steps union all select * from inv) a
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
