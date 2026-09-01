-- CEO 2026-09-01: "mặc định khi tạo 1 sản phẩm trên CRM sẽ tạo 1 sản phẩm
-- trên web cùng tên, có thể edit web và CRM độc lập". Trigger AFTER INSERT
-- trên equipment_types tự chèn website_products (slug "thue-<tên slug hoá>",
-- publish luôn — trang trần tên + giá, CEO bổ sung ảnh/mô tả/danh mục sau ở
-- CRM /website). Chỉ áp cho rental/sale — SP dịch vụ (product_type=service)
-- không có trang web. Sửa/xoá 2 bên vẫn độc lập như cũ (web chỉ fallback tên
-- CRM khi website_products.name null; xoá SP CRM thì trang web đi theo qua
-- FK cascade sẵn có).

-- Slug hoá tiếng Việt thuần SQL (không cần extension unaccent).
create or replace function public.website_slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(p_text),
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

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
  -- SP đã có trang (vd script tạo tay cả 2 bên) thì thôi.
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
  values (new.id, v_slug, true);
  return new;
end;
$$;

drop trigger if exists equipment_types_auto_website on public.equipment_types;
create trigger equipment_types_auto_website
  after insert on public.equipment_types
  for each row execute function public.auto_create_website_product();
