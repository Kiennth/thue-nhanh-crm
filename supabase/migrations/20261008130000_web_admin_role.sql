-- Vai trò "Web admin" (CEO 2026-10-08): quyền như Kỹ thuật/Sales (gắn chi
-- nhánh) + viết bài Blog web. Blog: chỉ Giám đốc + Web admin.
-- CHẠY 2 LƯỢT trong SQL editor: giá trị enum mới phải commit trước khi dùng.

-- ===== Lượt 1 =====
alter type public.user_role add value if not exists 'web_admin';

-- ===== Lượt 2 =====
-- Mọi policy đang liệt kê 'ky_thuat_sales' trong ARRAY vai trò (17 policy lúc
-- viết: equipment_*, order_equipment, order_payments…) → thêm 'web_admin' ngay
-- cạnh. Policy viết dạng "= 'ky_thuat_sales'" (không phải ARRAY) sẽ làm ALTER
-- lỗi cú pháp → cả khối rollback (an toàn), sửa tay.
do $$
declare
  r record;
  q text;
  c text;
  s text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where coalesce(qual, '') || coalesce(with_check, '') like '%''ky_thuat_sales''::user_role%'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%web_admin%'
  loop
    q := replace(r.qual, '''ky_thuat_sales''::user_role', '''ky_thuat_sales''::user_role, ''web_admin''::user_role');
    c := replace(r.with_check, '''ky_thuat_sales''::user_role', '''ky_thuat_sales''::user_role, ''web_admin''::user_role');
    s := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if q is not null then s := s || format(' using (%s)', q); end if;
    if c is not null then s := s || format(' with check (%s)', c); end if;
    execute s;
  end loop;
end $$;

-- Blog: chỉ Giám đốc + Web admin viết/sửa/xoá (đọc: mọi nhân viên).
drop policy if exists "blog_posts_insert_admin_ketoan" on public.blog_posts;
drop policy if exists "blog_posts_update_admin_ketoan" on public.blog_posts;
drop policy if exists "blog_posts_delete_admin_ketoan" on public.blog_posts;
drop policy if exists "blog_posts_insert_writers" on public.blog_posts;
drop policy if exists "blog_posts_update_writers" on public.blog_posts;
drop policy if exists "blog_posts_delete_writers" on public.blog_posts;
create policy "blog_posts_insert_writers" on public.blog_posts
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'web_admin'));
create policy "blog_posts_update_writers" on public.blog_posts
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'web_admin'))
  with check (public.auth_role() in ('giam_doc', 'web_admin'));
create policy "blog_posts_delete_writers" on public.blog_posts
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'web_admin'));
