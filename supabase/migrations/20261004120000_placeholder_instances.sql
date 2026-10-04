-- Lên đơn hàng serial khi kho hết máy (CEO 2026-10-04: "chọn mã hàng không có
-- hàng tao không click được"). DB bắt mỗi dòng serial phải gắn 1 máy thật,
-- nên khi thiếu, CRM tạo MÁY TẠM (mã AUTO-…, ghi chú "Máy CHỜ MUA") để vẫn lên
-- được đơn — giống Booqable cho đặt vượt tồn và báo thiếu. Máy tạm hiện ở
-- Thiết bị với ghi chú nhắc; nhập serial thật + giá mua thì ghi chú tự bỏ.
--
-- security definer: Kỹ thuật/Sales không có quyền ghi equipment_instances
-- (RLS chỉ Giám đốc/Admin/Kế toán/CHT) nhưng vẫn phải lên đơn được.
create or replace function public.create_placeholder_instances(
  p_equipment_type_id uuid,
  p_branch_id uuid,
  p_unit_id uuid,
  p_count int,
  p_note text
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type record;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_prefix text;
  i int;
begin
  if not public.is_employee() then
    raise exception 'not_employee';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'invalid_count';
  end if;
  select id, name, product_type, tracking_type into v_type
    from public.equipment_types where id = p_equipment_type_id;
  if not found or v_type.product_type <> 'rental' or v_type.tracking_type::text <> 'individual' then
    raise exception 'not_serial_type';
  end if;
  if p_unit_id is not null and not exists (
    select 1 from public.equipment_units where id = p_unit_id and equipment_type_id = p_equipment_type_id
  ) then
    raise exception 'unit_mismatch';
  end if;

  v_prefix := upper(left(regexp_replace(
    translate(lower(v_type.name),
      'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
    '[^a-z0-9]', '', 'g'), 8));

  for i in 1..p_count loop
    insert into public.equipment_instances (equipment_type_id, equipment_unit_id, identifier_code, branch_id, status, condition_notes)
    values (
      p_equipment_type_id,
      p_unit_id,
      'AUTO-CHOMUA-' || v_prefix || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
      p_branch_id,
      'available',
      left(coalesce(p_note, 'Máy CHỜ MUA — thay serial thật + nhập giá mua khi có máy'), 500)
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;

revoke all on function public.create_placeholder_instances(uuid, uuid, uuid, int, text) from public, anon;
grant execute on function public.create_placeholder_instances(uuid, uuid, uuid, int, text) to authenticated;
