-- Dữ liệu đơn hàng/doanh số từ CRM cũ, import để tham chiếu — không đụng vào
-- engine tính khoán/task 10 khâu của bảng orders. customer_id được khớp theo
-- SĐT/tên lúc import, có thể null nếu không khớp được khách hàng nào.
create table public.legacy_orders (
  id uuid primary key default gen_random_uuid(),
  old_order_code text,
  order_date date not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_raw text not null,
  customer_phone_raw text,
  branch_name text,
  product_summary text,
  total_value numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index legacy_orders_customer_id_idx on public.legacy_orders (customer_id);
create index legacy_orders_order_date_idx on public.legacy_orders (order_date);

alter table public.legacy_orders enable row level security;

create policy "legacy_orders_select_employees" on public.legacy_orders
  for select to authenticated using (public.is_employee());
create policy "legacy_orders_delete_admin_ketoan" on public.legacy_orders
  for delete to authenticated using (public.auth_role() in ('admin', 'ke_toan'));
