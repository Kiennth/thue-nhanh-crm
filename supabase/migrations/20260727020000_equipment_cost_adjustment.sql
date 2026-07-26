-- record_equipment_cost_adjustment — gán giá vốn cho tồn kho ĐÃ CÓ SẴN (mua
-- từ trước, chưa từng ghi nhận giá vốn), khác với record_equipment_purchase
-- (luôn CỘNG THÊM số lượng tồn kho). Hàm này chỉ ghi 1 dòng equipment_purchases
-- với quantity = đúng số lượng đang có tại chi nhánh đó — KHÔNG đụng tới
-- equipment_stock — để không biến 1 sản phẩm thành 2.
create function public.record_equipment_cost_adjustment(
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
    (p_equipment_unit_id, p_branch_id, v_quantity, p_unit_cost, current_date, p_note, public.auth_employee_id());
end;
$$;

grant execute on function public.record_equipment_cost_adjustment to authenticated;
