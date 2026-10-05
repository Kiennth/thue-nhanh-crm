-- Lịch làm việc nhân viên (CEO 2026-10-05): ca trực theo ngày + kho. Việc
-- được giao (giao/thu hồi/lắp đặt... có employee_id trên dòng đơn) đọc thẳng
-- từ order_equipment, không lưu ở đây. Mỗi người đăng ký link iCal riêng để
-- xem trên Google Calendar.
create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  shift_date date not null,
  kind text not null default 'work' check (kind in ('work', 'leave', 'off')),
  label text not null,
  start_time time,
  end_time time,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_shifts_date_idx on public.work_shifts (shift_date);
create index if not exists work_shifts_employee_idx on public.work_shifts (employee_id, shift_date);

alter table public.work_shifts enable row level security;

-- Ai cũng xem được lịch cả công ty (biết ai trực, ai nghỉ).
drop policy if exists work_shifts_read on public.work_shifts;
create policy work_shifts_read on public.work_shifts for select to authenticated using (public.is_employee());

-- Xếp ca: Giám đốc/Admin/Kế toán mọi kho; Cửa hàng trưởng chỉ nhân viên kho mình.
drop policy if exists work_shifts_write on public.work_shifts;
create policy work_shifts_write on public.work_shifts for all to authenticated
  using (exists (
    select 1 from public.employees me
    where me.user_id = auth.uid() and me.is_active
      and (me.role in ('giam_doc', 'admin', 'ke_toan')
           or (me.role = 'cua_hang_truong'
               and exists (select 1 from public.employees t where t.id = work_shifts.employee_id and t.branch_id = me.branch_id)))
  ))
  with check (exists (
    select 1 from public.employees me
    where me.user_id = auth.uid() and me.is_active
      and (me.role in ('giam_doc', 'admin', 'ke_toan')
           or (me.role = 'cua_hang_truong'
               and exists (select 1 from public.employees t where t.id = work_shifts.employee_id and t.branch_id = me.branch_id)))
  ));
