-- Việc của tôi + thông báo trong CRM (Grok tách gọn CRM 10/10, giai đoạn 4).
--
-- KHÔNG lưu bảng tasks riêng: việc = khâu ĐANG CHỜ của đơn (orders.status —
-- trạng thái đơn chính là khâu đang chờ), tính trực tiếp mỗi lần đọc. Đổi giờ
-- giao/trả → hạn đổi theo ngay; hoàn thành khâu → việc tự sang khâu sau. 231
-- đơn mở nên tính tại chỗ chỉ vài ms.
--
-- Chỉ đơn ĐÃ CHỐT (đang chờ Ký HĐ trở đi); báo giá chưa chốt không sinh việc.
-- Khâu Vận hành (không bắt buộc) tính như đang chờ Thu hồi.
-- Hạn: Ký HĐ & cọc = giao − 1 ngày · Chuẩn bị = giao − 2h · Giao = giờ giao ·
-- Thu hồi = giờ trả · Nghiệm thu = trả + 24h · Nhập kho = trả + 48h.
-- Việc quá hạn hơn 30 ngày (đơn BQ cũ kẹt khâu) không hiện — xem ở Đơn hàng.
--
-- Người nhận: người đã được phân công sẵn khâu đó (order_tasks chưa hoàn
-- thành); khâu Giao / Thu hồi lấy thêm người chạy dòng phí giao / thu hồi;
-- Ký HĐ & thu cọc mặc định người tạo đơn (người bán).
-- Không ai → "Chưa ai nhận" của kho (kho giao cho khâu trước giao, kho thu
-- hồi cho Thu hồi / Nghiệm thu / Nhập kho).

create or replace function public.open_step_tasks()
returns table (
  order_id uuid,
  order_code text,
  task_type public.task_type,
  due_at timestamptz,
  branch_id uuid,
  assignee_id uuid,
  customer_name text,
  phone text,
  address text
)
language sql
stable
set search_path = public
as $$
with o as (
  select o.id, o.order_code, o.customer_id, o.created_by, o.rental_start_at, o.rental_end_at,
         o.pickup_branch_id, o.return_branch_id, o.delivery_address, o.receiver_phone,
         case when o.status = 'van_hanh_xu_ly_su_co' then 'thu_hoi'::public.task_type else o.status end as step
  from public.orders o
  where o.completed_at is null and o.cancelled_at is null
    and o.status in ('ky_hop_dong_thu_coc', 'chuan_bi', 'giao_hang_ban_giao', 'van_hanh_xu_ly_su_co',
                     'thu_hoi', 'nghiem_thu', 'nhap_kho_bao_tri')
),
t as (
  select o.*,
    case o.step
      when 'ky_hop_dong_thu_coc' then o.rental_start_at - interval '1 day'
      when 'chuan_bi' then o.rental_start_at - interval '2 hours'
      when 'giao_hang_ban_giao' then o.rental_start_at
      when 'thu_hoi' then o.rental_end_at
      when 'nghiem_thu' then o.rental_end_at + interval '24 hours'
      when 'nhap_kho_bao_tri' then o.rental_end_at + interval '48 hours'
    end as due
  from o
)
select
  t.id, t.order_code, t.step, t.due,
  case when t.step in ('thu_hoi', 'nghiem_thu', 'nhap_kho_bao_tri') then t.return_branch_id else t.pickup_branch_id end,
  coalesce(
    ot.employee_id,
    (select l.employee_id from public.order_equipment l
      where l.order_id = t.id and l.employee_id is not null
        and l.equipment_type_id = any (case t.step
          when 'giao_hang_ban_giao' then array['38f5c644-3898-4b1f-a3f5-901e55f77c6a', 'ce4a5f88-8daa-47c2-92fc-196d1fc321db']::uuid[]
          when 'thu_hoi' then array['13c85fe0-8b13-4d76-9df5-a20b19598cc9', '1a53924a-a070-44b0-9441-3f09042af7e7']::uuid[]
          else array[]::uuid[] end)
      order by l.position limit 1),
    case when t.step = 'ky_hop_dong_thu_coc' then t.created_by end
  ),
  c.name,
  coalesce(nullif(trim(t.receiver_phone), ''), c.phone),
  nullif(trim(t.delivery_address), '')
from t
left join public.order_tasks ot on ot.order_id = t.id and ot.task_type = t.step and ot.completed_date is null
left join public.customers c on c.id = t.customer_id
where t.due is not null and t.due >= now() - interval '30 days';
$$;

-- Danh sách cho trang /my-tasks: mọi việc đang mở (lọc tab ở trình duyệt) +
-- việc tôi đã xong hôm nay.
create or replace function public.my_tasks()
returns jsonb
language sql
stable
set search_path = public
as $$
with me as (
  select id from public.employees where user_id = auth.uid() and is_active
)
select jsonb_build_object(
  'me', (select id from me),
  'now', now(),
  'tasks', (select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at), '[]'::jsonb) from (
    select t.*, e.name as assignee_name
    from public.open_step_tasks() t
    left join public.employees e on e.id = t.assignee_id
  ) x),
  'doneToday', (select coalesce(jsonb_agg(to_jsonb(y) order by y.created_at desc), '[]'::jsonb) from (
    select ot.order_id, o.order_code, ot.task_type, ot.created_at, c.name as customer_name
    from public.order_tasks ot
    join public.orders o on o.id = ot.order_id
    left join public.customers c on c.id = o.customer_id
    where ot.employee_id = (select id from me)
      and ot.completed_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
  ) y)
);
$$;

-- Thông báo trong CRM (chuông): việc của tôi sắp tới hạn (≤ 1 giờ) hoặc quá
-- hạn; Cửa hàng trưởng nhận thêm việc QUÁ HẠN của kho mình (cả việc chưa ai
-- nhận). Mỗi việc 1 thông báo cho mỗi loại — khoá gồm hạn, đổi giờ thì là
-- thông báo mới. Đã xem lưu ở task_alert_seen.
create table if not exists public.task_alert_seen (
  employee_id uuid not null references public.employees(id) on delete cascade,
  alert_key text not null,
  seen_at timestamptz not null default now(),
  primary key (employee_id, alert_key)
);
alter table public.task_alert_seen enable row level security;
drop policy if exists task_alert_seen_own_select on public.task_alert_seen;
create policy task_alert_seen_own_select on public.task_alert_seen
  for select to authenticated using (employee_id = public.auth_employee_id());
drop policy if exists task_alert_seen_own_insert on public.task_alert_seen;
create policy task_alert_seen_own_insert on public.task_alert_seen
  for insert to authenticated with check (employee_id = public.auth_employee_id());

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
a as (
  select t.*, 'overdue'::text as kind, t.assignee_id = (select id from me) as mine
  from t
  where t.due_at < now()
    and (t.assignee_id = (select id from me)
         or ((select role from me) = 'cua_hang_truong' and t.branch_id = (select branch_id from me)))
  union all
  select t.*, 'soon'::text, true
  from t
  where t.due_at >= now() and t.due_at < now() + interval '1 hour'
    and t.assignee_id = (select id from me)
),
k as (
  select a.*, a.order_id::text || ':' || a.task_type::text || ':' || a.kind || ':'
              || extract(epoch from a.due_at)::bigint::text as alert_key
  from a
)
select jsonb_build_object(
  -- Badge "Việc của tôi": việc của tôi hạn trong hôm nay hoặc đã quá hạn.
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

grant execute on function public.open_step_tasks() to authenticated;
grant execute on function public.my_tasks() to authenticated;
grant execute on function public.my_task_alerts() to authenticated;
revoke all on function public.open_step_tasks() from anon;
revoke all on function public.my_tasks() from anon;
revoke all on function public.my_task_alerts() from anon;

notify pgrst, 'reload schema';
