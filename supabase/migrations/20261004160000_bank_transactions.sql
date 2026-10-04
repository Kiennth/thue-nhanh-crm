-- Tiền vào tài khoản ngân hàng (CEO 2026-10-04): SePay báo từng giao dịch qua
-- webhook /api/bank/sepay → CRM tự ghi vào order_payments nếu nội dung có mã
-- đơn (QR in sẵn "DH20261004906" / "BQ13098"). Giao dịch không khớp đơn nằm ở
-- đây chờ người gán tay (trang /debts/bank).
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'sepay',
  provider_id text not null,
  account_number text,
  bank text,
  amount numeric(14, 2) not null,
  content text,
  reference_code text,
  transaction_at timestamptz not null,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched', 'ignored')),
  order_id uuid references public.orders(id) on delete set null,
  note text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_id)
);

create index if not exists bank_transactions_status_idx on public.bank_transactions (status, transaction_at desc);

-- Mỗi lần ghi tiền từ ngân hàng giữ khoá về giao dịch gốc (1 giao dịch có
-- thể tách 2 dòng: tiền thuê + cọc).
alter table public.order_payments
  add column if not exists bank_transaction_id uuid references public.bank_transactions(id) on delete set null;

alter table public.bank_transactions enable row level security;

drop policy if exists bank_transactions_read on public.bank_transactions;
create policy bank_transactions_read on public.bank_transactions
  for select to authenticated
  using (exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.is_active and e.role in ('giam_doc', 'admin', 'ke_toan')
  ));

drop policy if exists bank_transactions_update on public.bank_transactions;
create policy bank_transactions_update on public.bank_transactions
  for update to authenticated
  using (exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.is_active and e.role in ('giam_doc', 'admin', 'ke_toan')
  ));
