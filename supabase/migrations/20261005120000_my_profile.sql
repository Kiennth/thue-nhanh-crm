-- Hồ sơ của tôi (CEO 2026-10-05): nhân viên tự sửa thông tin cá nhân không
-- nhạy cảm qua RPC (RLS bảng employee_profiles vẫn chỉ Giám đốc ghi). SĐT
-- công ty, CCCD, ghi chú nội bộ: chỉ Giám đốc. Thêm ảnh đại diện + giới thiệu.
alter table public.employee_profiles
  add column if not exists avatar_url text,
  add column if not exists bio text;

create or replace function public.update_my_profile(
  p_personal_phone text,
  p_facebook_url text,
  p_address text,
  p_emergency_name text,
  p_emergency_relation text,
  p_emergency_phone text,
  p_bio text,
  p_birthday date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.employees where user_id = auth.uid() and is_active;
  if v_id is null then
    raise exception 'not_employee';
  end if;
  insert into public.employee_profiles (employee_id, personal_phone, facebook_url, address,
    emergency_name, emergency_relation, emergency_phone, bio, updated_at)
  values (v_id, nullif(trim(p_personal_phone), ''), nullif(trim(p_facebook_url), ''), nullif(trim(p_address), ''),
    nullif(trim(p_emergency_name), ''), nullif(trim(p_emergency_relation), ''), nullif(trim(p_emergency_phone), ''),
    nullif(trim(p_bio), ''), now())
  on conflict (employee_id) do update set
    personal_phone = excluded.personal_phone,
    facebook_url = excluded.facebook_url,
    address = excluded.address,
    emergency_name = excluded.emergency_name,
    emergency_relation = excluded.emergency_relation,
    emergency_phone = excluded.emergency_phone,
    bio = excluded.bio,
    updated_at = now();
  update public.employees set birthday = p_birthday where id = v_id;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text, text, text, date) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text, date) to authenticated;
