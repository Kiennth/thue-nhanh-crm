-- Nhật ký hoạt động: ghi lại mọi thay đổi trên các bảng nghiệp vụ chính,
-- dùng 1 trigger chung thay vì sửa từng Server Action (53 hàm rải trên 8
-- file) — không thể quên log khi thêm action mới, tự đúng kể cả khi sửa DB
-- trực tiếp qua script. Full-row snapshot lưu dạng jsonb, tầng UI tự suy ra
-- nhãn hiển thị theo từng bảng (xem src/lib/activity-labels.ts).
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid references public.employees(id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);
create index activity_log_table_record_idx on public.activity_log (table_name, record_id);

alter table public.activity_log enable row level security;

-- Chỉ admin/kế toán được xem — log của employees chứa nguyên base_salary,
-- commission_tiers/bonus_tiers cũng nhạy cảm, nên KHÔNG mở is_employee() như
-- equipment_transfers.
create policy "activity_log_select_admin_ketoan" on public.activity_log
  for select to authenticated using (public.auth_role() in ('admin', 'ke_toan'));

-- Không có policy insert/update/delete cho client — chỉ trigger (security
-- definer) mới ghi được; đây là audit trail, không cho sửa/xoá sau khi ghi.

create function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (table_name, record_id, action, actor_id, old_data, new_data)
  values (
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    lower(TG_OP),
    public.auth_employee_id(),
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Gắn cho từng bảng nghiệp vụ chính. Cố tình bỏ qua order_equipment (sửa
-- giá/số lượng dòng hàng xảy ra liên tục khi tính lại giá → quá nhiễu) và
-- equipment_transfers/rfid_scan_log/rfid_tags (đã có màn hình lịch sử riêng).
create trigger orders_log_activity after insert or update or delete on public.orders
  for each row execute function public.log_activity();
create trigger order_tasks_log_activity after insert or update or delete on public.order_tasks
  for each row execute function public.log_activity();
create trigger order_payments_log_activity after insert or update or delete on public.order_payments
  for each row execute function public.log_activity();
create trigger customers_log_activity after insert or update or delete on public.customers
  for each row execute function public.log_activity();
create trigger employees_log_activity after insert or update or delete on public.employees
  for each row execute function public.log_activity();
create trigger branches_log_activity after insert or update or delete on public.branches
  for each row execute function public.log_activity();
create trigger equipment_types_log_activity after insert or update or delete on public.equipment_types
  for each row execute function public.log_activity();
create trigger equipment_instances_log_activity after insert or update or delete on public.equipment_instances
  for each row execute function public.log_activity();
create trigger equipment_stock_log_activity after insert or update or delete on public.equipment_stock
  for each row execute function public.log_activity();
create trigger pricing_templates_log_activity after insert or update or delete on public.pricing_templates
  for each row execute function public.log_activity();
create trigger commission_tiers_log_activity after insert or update or delete on public.commission_tiers
  for each row execute function public.log_activity();
create trigger bonus_tiers_log_activity after insert or update or delete on public.bonus_tiers
  for each row execute function public.log_activity();
create trigger task_weights_log_activity after insert or update or delete on public.task_weights
  for each row execute function public.log_activity();
