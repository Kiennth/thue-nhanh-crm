-- Mua hàng từ nhà cung cấp (CEO 2026-10-07: "xây qui trình, flow để mua hàng
-- từ NCC để lưu vết lịch sử").
--
-- Quy trình: Phiếu mua (MH0001…) — Nháp → Đã đặt (chờ hàng) → Đã nhập kho
-- (hoặc Huỷ). Nhập kho = 1 giao dịch (receive_purchase_order):
--   · hàng SERIAL: mỗi serial → 1 máy equipment_instances (giá mua, ngày mua,
--     bảo hành, kho nhận, purchase_order_id) — số serial phải = số lượng;
--   · hàng SỐ LƯỢNG: cộng tồn kho + 1 dòng equipment_purchases (giá vốn bình
--     quân, purchase_order_id) — đúng logic record_equipment_purchase.
-- Trả tiền NCC ghi ở supplier_payments (gắn phiếu) → còn nợ NCC từng phiếu.
-- Truy ngược: máy / dòng giá vốn → phiếu → NCC.

create sequence if not exists public.purchase_order_code_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('MH' || lpad(nextval('public.purchase_order_code_seq')::text, 4, '0')),
  supplier_id uuid not null references public.suppliers(id),
  branch_id uuid not null references public.branches(id),
  order_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received', 'cancelled')),
  supplier_invoice_no text,
  note text,
  received_at timestamptz,
  received_by uuid references public.employees(id),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id, order_date desc);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id),
  equipment_unit_id uuid references public.equipment_units(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  serials text[] not null default '{}',
  warranty_expires_on date,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines (purchase_order_id);
create index if not exists purchase_order_lines_type_idx on public.purchase_order_lines (equipment_type_id);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  method text not null default 'chuyen_khoan' check (method in ('chuyen_khoan', 'tien_mat', 'khac')),
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists supplier_payments_po_idx on public.supplier_payments (purchase_order_id);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id);

alter table public.equipment_instances
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;
alter table public.equipment_purchases
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
drop trigger if exists purchase_orders_log_activity on public.purchase_orders;
create trigger purchase_orders_log_activity after insert or update or delete on public.purchase_orders
  for each row execute function public.log_activity();
drop trigger if exists supplier_payments_log_activity on public.supplier_payments;
create trigger supplier_payments_log_activity after insert or update or delete on public.supplier_payments
  for each row execute function public.log_activity();

-- Quyền: Giám đốc/Admin/Kế toán toàn hệ thống; Cửa hàng trưởng phiếu của kho
-- mình. Trả tiền NCC: cùng nhóm, xoá khoản trả chỉ GĐ/Admin/KT.
create or replace function public.can_purchase_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
      or (public.auth_role() = 'cua_hang_truong' and p_branch_id = public.auth_branch_id());
$$;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.supplier_payments enable row level security;

drop policy if exists purchase_orders_all on public.purchase_orders;
create policy purchase_orders_all on public.purchase_orders for all to authenticated
  using (public.can_purchase_branch(branch_id)) with check (public.can_purchase_branch(branch_id));

drop policy if exists purchase_order_lines_all on public.purchase_order_lines;
create policy purchase_order_lines_all on public.purchase_order_lines for all to authenticated
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.can_purchase_branch(po.branch_id)))
  with check (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.can_purchase_branch(po.branch_id)));

drop policy if exists supplier_payments_read on public.supplier_payments;
create policy supplier_payments_read on public.supplier_payments for select to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong'));
drop policy if exists supplier_payments_insert on public.supplier_payments;
create policy supplier_payments_insert on public.supplier_payments for insert to authenticated
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong'));
drop policy if exists supplier_payments_delete on public.supplier_payments;
create policy supplier_payments_delete on public.supplier_payments for delete to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- Nhập kho cả phiếu trong 1 giao dịch — lỗi ở dòng nào thì không ghi gì.
create or replace function public.receive_purchase_order(p_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  po record;
  l record;
  t record;
  s text;
  n integer;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into po from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'Không tìm thấy phiếu mua'; end if;
  if po.status not in ('draft', 'ordered') then raise exception 'Phiếu % đã nhập kho hoặc đã huỷ', po.code; end if;
  if not public.can_purchase_branch(po.branch_id) then raise exception 'Không có quyền nhập kho phiếu này'; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = p_id) then
    raise exception 'Phiếu chưa có dòng hàng nào';
  end if;

  for l in select * from public.purchase_order_lines where purchase_order_id = p_id order by position, created_at loop
    select id, name, tracking_type into t from public.equipment_types where id = l.equipment_type_id;
    if t.tracking_type = 'individual' then
      n := coalesce(array_length(l.serials, 1), 0);
      if n <> l.quantity then
        raise exception '%: cần % serial, mới nhập %', t.name, l.quantity, n;
      end if;
      foreach s in array l.serials loop
        if exists (select 1 from public.equipment_instances where lower(identifier_code) = lower(trim(s))) then
          raise exception 'Serial % đã có trong CRM', trim(s);
        end if;
        insert into public.equipment_instances
          (equipment_type_id, equipment_unit_id, identifier_code, branch_id, status,
           purchase_price, purchase_date, purchase_order_id, warranty_expires_on, condition_notes)
        values
          (t.id, l.equipment_unit_id, trim(s), po.branch_id, 'available',
           l.unit_cost, today, p_id, l.warranty_expires_on, 'Nhập kho từ phiếu ' || po.code);
      end loop;
    elsif t.tracking_type = 'quantity' then
      if l.equipment_unit_id is null then
        raise exception '%: chọn biến thể trước khi nhập kho', t.name;
      end if;
      insert into public.equipment_stock (equipment_unit_id, branch_id, quantity_in_stock)
      values (l.equipment_unit_id, po.branch_id, l.quantity)
      on conflict (equipment_unit_id, branch_id)
      do update set quantity_in_stock = public.equipment_stock.quantity_in_stock + excluded.quantity_in_stock;
      insert into public.equipment_purchases
        (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by, purchase_order_id)
      values
        (l.equipment_unit_id, po.branch_id, l.quantity, l.unit_cost, today, 'Phiếu ' || po.code, public.auth_employee_id(), p_id);
    else
      raise exception '%: hàng combo/dịch vụ không nhập kho được', t.name;
    end if;
  end loop;

  update public.purchase_orders
     set status = 'received', received_at = now(), received_by = public.auth_employee_id()
   where id = p_id;
end;
$$;

-- Tổng tiền / đã trả từng phiếu (trang danh sách, trang NCC).
create or replace view public.purchase_order_totals with (security_invoker = true) as
select po.id as purchase_order_id,
       po.supplier_id,
       coalesce((select sum(l.quantity * l.unit_cost) from public.purchase_order_lines l where l.purchase_order_id = po.id), 0) as total,
       coalesce((select sum(p.amount) from public.supplier_payments p where p.purchase_order_id = po.id), 0) as paid
  from public.purchase_orders po;
