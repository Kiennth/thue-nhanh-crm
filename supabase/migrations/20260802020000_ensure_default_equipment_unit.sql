-- Thêm dòng hàng vào đơn cho loại CHƯA có biến thể (đa số loại hàng thực tế
-- chỉ có 0-1 biến thể — client không bắt chọn, server tự tạo ngầm biến thể
-- mặc định trùng tên sản phẩm). Bản đầu dùng service-role client
-- (@supabase/supabase-js thuần) vì RLS equipment_units chỉ cho Admin/Kế
-- toán/Giám đốc/Cửa hàng trưởng ghi — nhưng CHỈ IMPORT module đó (dù nhánh
-- code có chạy hay không) đã làm Cloudflare Worker sập với "Code generation
-- from strings disallowed": một phụ thuộc của @supabase/supabase-js gọi
-- eval/new Function ngay lúc nạp module, bị V8 isolate của Workers chặn.
-- Chuyển hẳn qua RPC security definer — dùng chung 1 client SSR đã chạy ổn
-- định trong toàn bộ orders.ts, không còn nhu cầu tạo client thứ hai.
create or replace function public.ensure_default_equipment_unit(p_equipment_type_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_type_name text;
begin
  if not exists (select 1 from public.employees where user_id = auth.uid() and is_active) then
    raise exception 'Không có quyền thực hiện thao tác này';
  end if;

  select id into v_unit_id from public.equipment_units
  where equipment_type_id = p_equipment_type_id
  limit 1;

  if v_unit_id is not null then
    return v_unit_id;
  end if;

  select name into v_type_name from public.equipment_types where id = p_equipment_type_id;
  if v_type_name is null then
    raise exception 'Không tìm thấy loại hàng hoá';
  end if;

  insert into public.equipment_units (equipment_type_id, brand_model)
  values (p_equipment_type_id, v_type_name)
  returning id into v_unit_id;

  return v_unit_id;
end;
$$;

revoke all on function public.ensure_default_equipment_unit(uuid) from anon;
