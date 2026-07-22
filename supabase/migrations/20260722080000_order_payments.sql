-- Lịch sử thanh toán của đơn hàng — mỗi lần khách trả tiền (đặt cọc, trả
-- thêm, trả nốt) là 1 dòng, tự cộng dồn ra đã thanh toán/còn thiếu thay vì
-- lưu 1 số tổng duy nhất, để giữ được lịch sử đối chiếu.

create type public.payment_method as enum ('tien_mat', 'chuyen_khoan', 'the', 'vi_dien_tu', 'khac');

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at date not null default current_date,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_payments_order_id_idx on public.order_payments(order_id);

alter table public.order_payments enable row level security;

-- Khớp đúng phân quyền của order_equipment: mọi nhân viên xem/tạo/sửa được,
-- chỉ Admin + Kế toán xoá được (tránh mất dữ liệu tài chính ngoài ý muốn).
create policy "order_payments_select_employees" on public.order_payments
  for select to authenticated using (public.is_employee());
create policy "order_payments_insert_employees" on public.order_payments
  for insert to authenticated with check (public.is_employee());
create policy "order_payments_update_employees" on public.order_payments
  for update to authenticated
  using (public.is_employee())
  with check (public.is_employee());
create policy "order_payments_delete_admin_ketoan" on public.order_payments
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
