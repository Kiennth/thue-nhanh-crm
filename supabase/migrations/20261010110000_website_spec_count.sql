-- B4 (Grok CRM 09/10): cảnh báo sản phẩm có < 4 thông số. Cột đếm số mã
-- trường trong spec_facets (tự tính) để trang Website lọc "Thiếu thông số".
create or replace function public.jsonb_key_count(j jsonb)
returns integer
language sql
immutable
parallel safe
as $$ select count(*)::int from jsonb_object_keys(coalesce(j, '{}'::jsonb)) $$;

alter table public.website_products
  add column if not exists spec_count integer
    generated always as (public.jsonb_key_count(spec_facets)) stored;

notify pgrst, 'reload schema';
