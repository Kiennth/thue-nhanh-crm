-- CEO chốt CRM chạy theo giờ VN (GMT+7). Đã sửa tầng app (src/lib/vn-time.ts)
-- nhưng phát hiện 2 chỗ ở TẦNG DATABASE cũng dùng current_date/CURRENT_DATE
-- của Postgres — hàm này đọc theo timezone của SESSION DB (đã xác nhận =
-- UTC, `select current_setting('timezone')`), không phải giờ VN, và app
-- layer không sửa được vì code chạy hẳn trong Postgres.

begin;

-- record_equipment_cost_adjustment: LỖI THẬT ĐANG SỐNG — current_date hard
-- code ngay trong hàm, không nhận tham số ngày từ app. Gán giá vốn cho tồn
-- kho có sẵn vào khung 00:00-06:59 giờ VN sẽ ghi purchase_date của HÔM QUA
-- (UTC). Đổi sang tính trực tiếp theo giờ VN, không phụ thuộc session
-- timezone.
create or replace function public.record_equipment_cost_adjustment(
  p_equipment_unit_id uuid,
  p_branch_id uuid,
  p_unit_cost numeric,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_quantity integer;
begin
  if not (
    public.auth_role() in ('giam_doc', 'admin', 'ke_toan')
    or (public.auth_role() = 'cua_hang_truong' and p_branch_id = public.auth_branch_id())
  ) then
    raise exception 'Không có quyền điều chỉnh giá vốn';
  end if;

  if p_unit_cost < 0 then
    raise exception 'Giá vốn không được âm';
  end if;

  select quantity_in_stock into v_quantity
    from public.equipment_stock
    where equipment_unit_id = p_equipment_unit_id and branch_id = p_branch_id;

  if v_quantity is null or v_quantity <= 0 then
    raise exception 'Chi nhánh này chưa có tồn kho để điều chỉnh giá vốn';
  end if;

  insert into public.equipment_purchases
    (equipment_unit_id, branch_id, quantity, unit_cost, purchase_date, note, created_by)
  values
    (
      p_equipment_unit_id,
      p_branch_id,
      v_quantity,
      p_unit_cost,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      p_note,
      public.auth_employee_id()
    );
end;
$$;

-- 5 cột "date not null default current_date" — kiểm tra toàn bộ đường insert
-- trong app (createOrder/recordEquipmentPurchase/recordEquipmentDisposal/
-- createOrderPayment/createOvertimeEntry) đều bắt buộc form truyền ngày,
-- KHÔNG đường nào đang dựa vào default này — nhưng sửa luôn để phòng insert
-- tay qua Table Editor hoặc code sau này quên truyền, đúng tinh thần "GMT+7
-- toàn hệ thống".
alter table public.orders
  alter column order_date set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;
alter table public.equipment_purchases
  alter column purchase_date set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;
alter table public.equipment_disposals
  alter column disposal_date set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;
alter table public.order_payments
  alter column paid_at set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;
alter table public.overtime_entries
  alter column entry_date set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;

commit;
