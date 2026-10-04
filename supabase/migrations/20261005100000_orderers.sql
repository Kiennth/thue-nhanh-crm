-- Người đặt hàng (CEO 2026-10-05): người liên hệ đặt đơn — hay chuyển công ty,
-- làm freelancer — nên tách khỏi khách hàng (pháp nhân), nhận diện theo SĐT
-- (9 số cuối). Mục đích: chăm sóc mối quan hệ (ai đang mang khách về, ai lâu
-- không đặt). Xem trang: Giám đốc/Admin/Kế toán/Cửa hàng trưởng.
create table if not exists public.orderers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone_key text unique,
  email text,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists orderer_id uuid references public.orderers(id) on delete set null;
create index if not exists orders_orderer_id_idx on public.orders (orderer_id);

create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 9
    then right(regexp_replace(p, '\D', '', 'g'), 9)
  end
$$;

-- Gắn đơn với người đặt theo SĐT (hoặc email nếu không có SĐT); chưa có thì
-- tạo hồ sơ. Chạy khi đơn được tạo/sửa ô người đặt — mọi form đều đi qua đây.
create or replace function public.link_order_orderer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public.phone_key(new.orderer_phone);
  v_email text := nullif(lower(trim(coalesce(new.orderer_email, ''))), '');
  v_name text := nullif(trim(coalesce(new.orderer_name, '')), '');
  v_id uuid;
begin
  if k is not null then
    select id into v_id from public.orderers where phone_key = k;
    if v_id is null then
      insert into public.orderers (name, phone, phone_key, email)
      values (coalesce(v_name, trim(new.orderer_phone)), trim(new.orderer_phone), k, v_email)
      returning id into v_id;
    else
      update public.orderers
         set name = case when name = phone and v_name is not null then v_name else name end,
             email = coalesce(email, v_email),
             updated_at = now()
       where id = v_id;
    end if;
  elsif v_email is not null then
    select id into v_id from public.orderers where lower(email) = v_email limit 1;
    if v_id is null then
      insert into public.orderers (name, email) values (coalesce(v_name, v_email), v_email) returning id into v_id;
    end if;
  else
    v_id := null;
  end if;
  new.orderer_id := v_id;
  return new;
end;
$$;

drop trigger if exists orders_link_orderer on public.orders;
create trigger orders_link_orderer
  before insert or update of orderer_name, orderer_phone, orderer_email on public.orders
  for each row execute function public.link_order_orderer();

alter table public.orderers enable row level security;
-- Mọi nhân viên đọc được (để gõ chọn khi lên đơn); sửa hồ sơ: 4 vai trò quản lý.
drop policy if exists orderers_read on public.orderers;
create policy orderers_read on public.orderers for select to authenticated using (public.is_employee());
drop policy if exists orderers_write on public.orderers;
create policy orderers_write on public.orderers for update to authenticated
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                 and e.role in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong')));

-- Thống kê từng người đặt cho trang /orderers — doanh số chỉ đơn ĐÃ GIAO, gồm VAT.
create or replace function public.orderer_stats(p_orderer_id uuid default null)
returns table (
  orderer_id uuid,
  order_count int,
  revenue numeric,
  first_order_date date,
  last_order_date date,
  companies text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.orderer_id,
    count(*)::int,
    coalesce(sum(round(o.total_value * 1.08 * 100) / 100) filter (where o.delivered_at is not null), 0),
    min(o.order_date),
    max(o.order_date),
    array_agg(distinct c.name) filter (where c.name is not null)
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.orderer_id is not null
    and o.cancelled_at is null
    and (p_orderer_id is null or o.orderer_id = p_orderer_id)
    and exists (select 1 from public.employees e where e.user_id = auth.uid() and e.is_active
                and e.role in ('giam_doc', 'admin', 'ke_toan', 'cua_hang_truong'))
  group by o.orderer_id
$$;
revoke all on function public.orderer_stats(uuid) from public, anon;
grant execute on function public.orderer_stats(uuid) to authenticated;

-- Gắn các đơn cũ đã có SĐT/email người đặt.
update public.orders set orderer_phone = orderer_phone
 where coalesce(orderer_phone, '') <> '' or coalesce(orderer_email, '') <> '';
