-- Nhật ký từng dòng hàng của đơn (CEO 2026-10-09 "bật ghi nhật ký từng dòng
-- hàng" — sau vụ PO13133 phải suy ra ai thêm/bớt máy từ thay đổi tổng tiền).
-- Trước đây order_equipment cố ý KHÔNG ghi (20260725000000) vì tính lại giá
-- làm mọi dòng đổi liên tục. Nay ghi có chọn lọc:
--   * thêm dòng, xoá dòng: luôn ghi
--   * sửa: chỉ khi đổi số lượng / sản phẩm / biến thể / serial / đơn giá /
--     số kỳ tính tiền / tên dòng tự do — bỏ qua đổi vị trí, thành tiền tự tính.
-- Snapshot kèm _order_code, _type_name để trang Nhật ký hiện nhãn dễ đọc.
create or replace function public.log_order_line_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
begin
  if TG_OP = 'UPDATE' and not (
    old.quantity is distinct from new.quantity
    or old.equipment_type_id is distinct from new.equipment_type_id
    or old.equipment_unit_id is distinct from new.equipment_unit_id
    or old.requested_unit_id is distinct from new.requested_unit_id
    or old.equipment_instance_id is distinct from new.equipment_instance_id
    or old.unit_price is distinct from new.unit_price
    or old.charge_duration is distinct from new.charge_duration
    or old.custom_name is distinct from new.custom_name
  ) then
    return new;
  end if;

  select jsonb_build_object(
           '_order_code', (select o.order_code from public.orders o where o.id = coalesce(new.order_id, old.order_id)),
           '_type_name', (select t.name from public.equipment_types t where t.id = coalesce(new.equipment_type_id, old.equipment_type_id)),
           '_serial', (select i.identifier_code from public.equipment_instances i where i.id = coalesce(new.equipment_instance_id, old.equipment_instance_id))
         )
    into v_ctx;

  insert into public.activity_log (table_name, record_id, action, actor_id, old_data, new_data)
  values (
    'order_equipment',
    coalesce(new.id, old.id),
    lower(TG_OP),
    public.auth_employee_id(),
    case when TG_OP = 'INSERT' then null else to_jsonb(old) || v_ctx end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) || v_ctx end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists order_equipment_log_activity on public.order_equipment;
create trigger order_equipment_log_activity
  after insert or update or delete on public.order_equipment
  for each row execute function public.log_order_line_activity();
