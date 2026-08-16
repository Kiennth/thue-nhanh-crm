-- ---------------------------------------------------------------------
-- Lớp nội dung cho WEBSITE CÔNG KHAI (new.thuenhanh.vn) — CEO duyệt plan
-- 2026-08-16. Web mới đọc catalog từ CHÍNH Supabase này bằng anon key,
-- nhưng KHÔNG đụng thẳng bảng CRM:
--
--   1. Bảng website_* giữ phần "marketing" không có chỗ trong CRM: slug
--      SEO, mô tả, gallery, danh mục web (taxonomy riêng — equipment_
--      categories của CRM gán lỗ chỗ, không dùng làm menu web được).
--   2. Giá/cọc KHÔNG copy — view join live từ equipment_types nên web
--      không bao giờ lệch giá CRM.
--   3. Anon chỉ đọc qua 3 view *_public lộ đúng cột an toàn; bảng gốc
--      vẫn khoá theo RLS nhân viên như cũ. View chạy quyền owner
--      (security_invoker = off, cùng cơ chế employees_public).
--
-- CRM chưa có UI sửa bảng này — nội dung ban đầu do scripts/seed-content
-- .ts bên repo web đổ vào (CEO duyệt qua review.csv), sửa lặt vặt qua
-- Dashboard cho tới khi làm màn quản trị trong CRM (việc sau).
-- ---------------------------------------------------------------------

-- =============================== BẢNG ================================

create table if not exists public.website_categories (
  id uuid primary key default gen_random_uuid(),
  -- Slug là URL đầy đủ sau dấu / ("thue-macbook") — route web chỉ có một
  -- segment động nên slug danh mục và sản phẩm dùng chung một không gian,
  -- không được trùng nhau (web tra danh mục trước, sản phẩm sau).
  slug text not null unique,
  -- Song ngữ (CEO chốt 2026-08-16): cột gốc = tiếng Việt, cột *_en =
  -- tiếng Anh (AI dịch sẵn, sửa tay được). Web render /en/... thì ưu
  -- tiên *_en, null thì rơi về tiếng Việt. Slug DÙNG CHUNG 2 ngôn ngữ
  -- (URL /thue-macbook và /en/thue-macbook) — hreflang lo phần SEO.
  name text not null,
  name_en text,
  seo_title text,
  seo_title_en text,
  seo_description text,
  seo_description_en text,
  -- Đoạn văn SEO đầu trang danh mục (kiểu Grover) — HTML đã sanitize từ
  -- phía ghi (seed script/CRM), web render thẳng.
  intro_html text,
  intro_html_en text,
  hero_image_url text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  -- Link mềm sang danh mục CRM nếu muốn đối chiếu — không bắt buộc.
  equipment_category_id uuid references public.equipment_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger website_categories_set_updated_at
  before update on public.website_categories
  for each row execute function public.set_updated_at();

create table if not exists public.website_products (
  id uuid primary key default gen_random_uuid(),
  -- 1-1 với loại hàng CRM: có dòng ở đây + is_published = true thì mới
  -- lên web; xoá loại hàng bên CRM thì nội dung web đi theo luôn.
  equipment_type_id uuid not null unique references public.equipment_types(id) on delete cascade,
  slug text not null unique,
  -- Tên hiển thị marketing (null = dùng tên CRM). Cặp cột vi/*_en cùng
  -- quy ước với website_categories: /en/ ưu tiên *_en, null rơi về vi.
  name text,
  name_en text,
  short_description text,
  short_description_en text,
  description_html text,
  description_html_en text,
  seo_title text,
  seo_title_en text,
  seo_description text,
  seo_description_en text,
  brand text,
  -- Gallery bổ sung; ảnh đại diện fallback về equipment_types.image_url.
  gallery_image_urls text[] not null default '{}',
  website_category_id uuid references public.website_categories(id) on delete set null,
  sort_order integer not null default 0,
  -- Dải "Thuê nhiều nhất" trang chủ.
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger website_products_set_updated_at
  before update on public.website_products
  for each row execute function public.set_updated_at();

create index if not exists website_products_category_idx
  on public.website_products (website_category_id);
create index if not exists website_products_published_idx
  on public.website_products (is_published) where is_published;

-- Khách để lại liên hệ từ form web — CRM đọc như dữ liệu nội bộ, khách
-- anon chỉ GHI qua RPC website_submit_lead bên dưới, không đọc được gì.
create table if not exists public.website_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  message text,
  product_slug text,
  source_page text,
  created_at timestamptz not null default now()
);

-- ================================ RLS ================================

alter table public.website_categories enable row level security;
alter table public.website_products enable row level security;
alter table public.website_leads enable row level security;

-- Đọc: mọi nhân viên. Ghi: cùng bộ vai trò quản lý equipment_types
-- (giam_doc/admin/ke_toan) — ai quản sản phẩm thì quản nội dung web.
create policy "website_categories_select_employees" on public.website_categories
  for select to authenticated using (public.is_employee());
create policy "website_categories_write_admin_ketoan" on public.website_categories
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "website_categories_update_admin_ketoan" on public.website_categories
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "website_categories_delete_admin_ketoan" on public.website_categories
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create policy "website_products_select_employees" on public.website_products
  for select to authenticated using (public.is_employee());
create policy "website_products_write_admin_ketoan" on public.website_products
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "website_products_update_admin_ketoan" on public.website_products
  for update to authenticated
  using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "website_products_delete_admin_ketoan" on public.website_products
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create policy "website_leads_select_employees" on public.website_leads
  for select to authenticated using (public.is_employee());
create policy "website_leads_delete_admin_ketoan" on public.website_leads
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

-- ============================ VIEW PUBLIC ============================
-- security_invoker = off (mặc định nhưng ghi rõ chủ đích): view chạy
-- quyền owner để vượt RLS bảng gốc, đổi lại CHỈ SELECT đúng cột an toàn
-- và CHỈ hàng đã publish. Tuyệt đối không thêm cột giá vốn/tồn kho/nội
-- bộ vào đây.

create or replace view public.website_products_public
  with (security_invoker = off) as
select
  wp.slug,
  coalesce(wp.name, et.name) as name,
  coalesce(wp.name_en, wp.name, et.name) as name_en,
  wp.short_description,
  wp.short_description_en,
  wp.description_html,
  wp.description_html_en,
  wp.seo_title,
  wp.seo_title_en,
  wp.seo_description,
  wp.seo_description_en,
  wp.brand,
  wp.gallery_image_urls,
  et.image_url as fallback_image_url,
  et.price,
  et.rental_period_unit,
  et.pricing_method,
  et.pricing_template_id,
  et.deposit_amount,
  wc.slug as category_slug,
  wc.name as category_name,
  wp.is_featured,
  wp.sort_order,
  wp.updated_at
from public.website_products wp
join public.equipment_types et on et.id = wp.equipment_type_id
left join public.website_categories wc
  on wc.id = wp.website_category_id and wc.is_published
where wp.is_published
  and et.product_type = 'rental';

create or replace view public.website_categories_public
  with (security_invoker = off) as
select
  wc.slug,
  wc.name,
  coalesce(wc.name_en, wc.name) as name_en,
  wc.seo_title,
  wc.seo_title_en,
  wc.seo_description,
  wc.seo_description_en,
  wc.intro_html,
  wc.intro_html_en,
  wc.hero_image_url,
  wc.sort_order,
  (
    select count(*)
    from public.website_products wp
    join public.equipment_types et on et.id = wp.equipment_type_id
    where wp.website_category_id = wc.id
      and wp.is_published
      and et.product_type = 'rental'
  ) as product_count
from public.website_categories wc
where wc.is_published;

create or replace view public.website_pricing_tiers_public
  with (security_invoker = off) as
select distinct
  ptt.template_id as pricing_template_id,
  ptt.min_duration,
  ptt.duration_unit,
  ptt.discount_percentage
from public.pricing_template_tiers ptt
where ptt.template_id in (
  select et.pricing_template_id
  from public.website_products wp
  join public.equipment_types et on et.id = wp.equipment_type_id
  where wp.is_published and et.pricing_template_id is not null
);

grant select on public.website_products_public to anon, authenticated;
grant select on public.website_categories_public to anon, authenticated;
grant select on public.website_pricing_tiers_public to anon, authenticated;

-- ============================ RPC LEAD ===============================
-- Điểm GHI duy nhất của khách anon trong toàn hệ thống — cả nhà revoke
-- anon trên mọi RPC, riêng hàm này grant CÓ CHỦ ĐÍCH: form liên hệ web.
-- Web đã chặn spam bằng Turnstile trước khi gọi; đây chỉ chặn dữ liệu rác.

create or replace function public.website_submit_lead(
  p_name text,
  p_phone text,
  p_message text default null,
  p_product_slug text default null,
  p_source_page text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 200 then
    raise exception 'invalid_name';
  end if;
  if p_phone is null or length(regexp_replace(p_phone, '[^0-9+]', '', 'g')) < 8
     or length(p_phone) > 20 then
    raise exception 'invalid_phone';
  end if;
  if length(coalesce(p_message, '')) > 2000
     or length(coalesce(p_product_slug, '')) > 200
     or length(coalesce(p_source_page, '')) > 500 then
    raise exception 'too_long';
  end if;

  insert into public.website_leads (name, phone, message, product_slug, source_page)
  values (trim(p_name), trim(p_phone), nullif(trim(p_message), ''),
          nullif(trim(p_product_slug), ''), nullif(trim(p_source_page), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.website_submit_lead(text, text, text, text, text) from public;
grant execute on function public.website_submit_lead(text, text, text, text, text) to anon, authenticated;
