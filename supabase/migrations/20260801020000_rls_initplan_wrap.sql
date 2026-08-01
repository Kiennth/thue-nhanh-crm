-- =============================================================================
-- Bọc các hàm helper trong RLS policy thành scalar subquery (InitPlan)
-- =============================================================================
--
-- Vấn đề (đo được, không đoán): cùng 1 truy vấn order_equipment, service-role
-- (bỏ RLS) mất 843ms còn qua phiên đăng nhập mất ~11-12s. Nguyên nhân là
-- anti-pattern RLS kinh điển của Supabase: policy viết `auth_role() = ...`
-- khiến Postgres gọi hàm cho TỪNG DÒNG được quét (hàm security definer không
-- inline được — mỗi lời gọi là 1 lượt index scan bảng employees; bảng orders
-- 10.000 dòng = 10.000 lượt mỗi câu lệnh).
--
-- Cách sửa chuẩn (docs Supabase "RLS performance"): bọc lời gọi thành
-- `(select auth_role())` — trở thành InitPlan, tính đúng 1 lần mỗi câu lệnh.
-- Giá trị boolean của biểu thức không đổi ở mọi dòng (hàm STABLE), nên ngữ
-- nghĩa phân quyền GIỮ NGUYÊN TUYỆT ĐỐI — chỉ đổi số lần tính.
--
-- Thay vì chép tay ~88 policy (dễ gõ nhầm 1 ký tự là hỏng phân quyền), để
-- chính Postgres biến đổi từ pg_policies rồi ALTER POLICY từng cái. ALTER
-- POLICY chỉ đổi được USING/WITH CHECK — không thể đổi FOR/TO, nên không có
-- cửa nới quyền do nhầm lệnh. Toàn bộ chạy trong 1 transaction: 1 biểu thức
-- không parse được là rollback sạch, không có trạng thái nửa vời.

begin;

-- Hàm tạm (pg_temp — tự biến mất khi hết phiên): bọc mọi lời gọi helper.
-- Thay dạng có schema TRƯỚC dạng trần qua placeholder, vì "public.auth_role()"
-- chứa chuỗi con "auth_role()" — thay trần trước sẽ phá dạng có schema.
create function pg_temp.wrap_rls(expr text) returns text
language plpgsql as $f$
declare
  s text := expr;
begin
  if s is null then
    return null;
  end if;
  s := replace(s, 'public.auth_role()',        '@@AR@@');
  s := replace(s, 'auth_role()',               '@@AR@@');
  s := replace(s, 'public.auth_branch_id()',   '@@AB@@');
  s := replace(s, 'auth_branch_id()',          '@@AB@@');
  s := replace(s, 'public.auth_employee_id()', '@@AE@@');
  s := replace(s, 'auth_employee_id()',        '@@AE@@');
  s := replace(s, 'public.is_employee()',      '@@IE@@');
  s := replace(s, 'is_employee()',             '@@IE@@');
  s := replace(s, 'auth.uid()',                '@@AU@@');
  s := replace(s, '@@AR@@', '(select public.auth_role())');
  s := replace(s, '@@AB@@', '(select public.auth_branch_id())');
  s := replace(s, '@@AE@@', '(select public.auth_employee_id())');
  s := replace(s, '@@IE@@', '(select public.is_employee())');
  s := replace(s, '@@AU@@', '(select auth.uid())');
  return s;
end $f$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
  changed int := 0;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    new_qual := pg_temp.wrap_rls(p.qual);
    new_check := pg_temp.wrap_rls(p.with_check);
    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
      if new_qual is not null then
        stmt := stmt || format(' using (%s)', new_qual);
      end if;
      if new_check is not null then
        stmt := stmt || format(' with check (%s)', new_check);
      end if;
      execute stmt;
      changed := changed + 1;
    end if;
  end loop;
  raise notice 'Đã bọc InitPlan cho % policy', changed;
end $$;

drop function pg_temp.wrap_rls(text);

commit;
