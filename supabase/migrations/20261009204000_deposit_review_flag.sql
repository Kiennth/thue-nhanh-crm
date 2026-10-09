-- B7 (Grok CRM 09/10): cọc 0đ = "Không cần cọc" + cờ "Cọc 0đ – cần xem".
--   * deposit_review_status: none / needs_review / reviewed (+ ai, lúc nào).
--   * Tự gắn cờ khi TẠO hoặc ĐỔI giá/cọc mà cọc = 0 (không "thoả thuận") và
--     (giá ≥ 300.000đ/ngày HOẶC thuộc nhóm giá trị cao). Cọc > 0 hoặc thoả
--     thuận → bỏ cờ. "Giữ 0đ · đã xem" = reviewed, giữ tới khi đổi giá/cọc.
--   * Chỉ hàng cho thuê, không tính combo (cọc combo = tổng món con).
-- Không đổi deposit_amount sang null (Grok gợi ý "— chưa nhập"): mọi chỗ
-- đang coi 0 = Không cần cọc; cờ này thay cho trạng thái "chưa nhập".
alter table public.equipment_types
  add column if not exists deposit_review_status text not null default 'none'
    check (deposit_review_status in ('none', 'needs_review', 'reviewed')),
  add column if not exists deposit_reviewed_by uuid references public.employees(id) on delete set null,
  add column if not exists deposit_reviewed_at timestamptz;

create or replace function public.equipment_deposit_review_flag()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_high boolean;
begin
  if new.product_type <> 'rental' or new.tracking_type = 'combo' then
    return new;
  end if;
  if coalesce(new.deposit_amount, 0) > 0 or new.deposit_negotiable then
    new.deposit_review_status := 'none';
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.deposit_amount is not distinct from new.deposit_amount
     and old.price is not distinct from new.price
     and old.deposit_negotiable is not distinct from new.deposit_negotiable then
    return new;
  end if;
  select exists (
    select 1 from public.equipment_categories c
    where c.id = new.category_id
      and c.name in ('PC & Mac', 'PC Laptop', 'Điện Thoại', 'iPhone', 'Máy tính Bảng', 'iPad', 'Máy Ảnh & Máy Quay')
  ) into v_high;
  if new.price >= 300000 or v_high then
    new.deposit_review_status := 'needs_review';
    new.deposit_reviewed_by := null;
    new.deposit_reviewed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_types_deposit_review on public.equipment_types;
create trigger equipment_types_deposit_review
  before insert or update on public.equipment_types
  for each row execute function public.equipment_deposit_review_flag();

notify pgrst, 'reload schema';
