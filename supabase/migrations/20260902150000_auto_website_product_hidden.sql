-- CEO 2026-09-02: SP mới tạo trên CRM vẫn tự sinh trang web (trigger
-- 20260901000000) nhưng mặc định ẨN — CEO bổ sung ảnh/mô tả xong bấm
-- "hiện" ở CRM /website mới lên trang. Ảnh đại diện dùng chung với CRM
-- như trước giờ (web fallback equipment_types.image_url khi trang chưa
-- có gallery riêng). Chỉ đổi is_published=false ở câu insert.
create or replace function public.auto_create_website_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_base text;
  v_n integer := 2;
begin
  if new.product_type not in ('rental', 'sale') then
    return new;
  end if;
  if exists (select 1 from public.website_products wp where wp.equipment_type_id = new.id) then
    return new;
  end if;
  v_base := left('thue-' || public.website_slugify(new.name), 60);
  v_slug := v_base;
  while exists (select 1 from public.website_products where slug = v_slug)
     or exists (select 1 from public.website_categories where slug = v_slug)
  loop
    v_slug := v_base || '-' || v_n;
    v_n := v_n + 1;
  end loop;
  insert into public.website_products (equipment_type_id, slug, is_published)
  values (new.id, v_slug, false);
  return new;
end;
$$;
