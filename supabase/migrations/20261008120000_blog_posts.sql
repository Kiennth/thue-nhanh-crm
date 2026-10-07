-- Blog trên web thuenhanh.vn (CEO 2026-10-08: "làm khu vực Blog để tao viết
-- bài content"; khung theo gói SEO Grok — 4 chuyên mục, BlogPosting schema).
-- Soạn trong CRM (Website → Blog), web đọc qua view blog_posts_public.
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) > 0),
  -- Trống → web dùng title / excerpt.
  seo_title text,
  seo_description text,
  excerpt text,
  content_html text not null default '',
  cover_image_url text,
  cover_alt text,
  category text not null default 'huong-dan-chon-thiet-bi'
    check (category in ('kinh-nghiem-to-chuc-su-kien', 'huong-dan-chon-thiet-bi', 'quay-phim-livestream', 'gia-thue-so-sanh')),
  -- Slug danh mục web → khối "Thiết bị liên quan" cuối bài.
  related_category_slugs text[] not null default '{}',
  author_name text not null default 'Nguyễn Trung Kiên – Thuê Nhanh',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

alter table public.blog_posts enable row level security;

-- Cùng bộ quyền nội dung web (giam_doc/admin/ke_toan).
drop policy if exists "blog_posts_select_employees" on public.blog_posts;
create policy "blog_posts_select_employees" on public.blog_posts
  for select to authenticated using (public.is_employee());
drop policy if exists "blog_posts_insert_admin_ketoan" on public.blog_posts;
create policy "blog_posts_insert_admin_ketoan" on public.blog_posts
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "blog_posts_update_admin_ketoan" on public.blog_posts;
create policy "blog_posts_update_admin_ketoan" on public.blog_posts
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
drop policy if exists "blog_posts_delete_admin_ketoan" on public.blog_posts;
create policy "blog_posts_delete_admin_ketoan" on public.blog_posts
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- Web (anon) chỉ thấy bài đã đăng và tới giờ đăng (hẹn giờ được).
create or replace view public.blog_posts_public
  with (security_invoker = off) as
select
  slug, title, seo_title, seo_description, excerpt, content_html,
  cover_image_url, cover_alt, category, related_category_slugs,
  author_name, published_at, updated_at
from public.blog_posts
where status = 'published' and published_at is not null and published_at <= now();

grant select on public.blog_posts_public to anon, authenticated;
