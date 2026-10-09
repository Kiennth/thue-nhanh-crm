-- Tồn kho THAM KHẢO NỘI BỘ (CEO 2026-10-09: "tồn kho thực tế chỉ để tham khảo,
-- thông báo — máy hết là anh mua thêm"; "KHÔNG LÀM VIEW TỒN KHO CHO KHÁCH").
-- CHỈ nhân viên đăng nhập CRM (authenticated) đọc được — anon bị thu quyền,
-- web công khai KHÔNG đọc tồn kho. CRM dùng để báo đơn web vượt số máy.
--   available = máy đang sẵn sàng (serial status 'available' + SL quantity_in_stock)
--   owned     = máy đang sở hữu (serial khác 'disposed' + SL quantity_total)
create or replace view public.website_product_stock_public
  with (security_invoker = off) as
with inst as (
  select ei.equipment_type_id, ei.branch_id,
         count(*) filter (where ei.status = 'available') as available,
         count(*) filter (where ei.status <> 'disposed') as owned
  from public.equipment_instances ei
  group by 1, 2
), qty as (
  select eu.equipment_type_id, es.branch_id,
         sum(coalesce(es.quantity_in_stock, 0)) as available,
         sum(coalesce(es.quantity_total, 0)) as owned
  from public.equipment_stock es
  join public.equipment_units eu on eu.id = es.equipment_unit_id
  group by 1, 2
), allx as (
  select * from inst union all select * from qty
)
select wp.slug as product_slug,
       case b.name when 'TP HCM' then 'hcm' when 'Hà Nội' then 'hn' when 'Đà Nẵng' then 'dn' else 'other' end as city,
       sum(a.available)::int as available,
       sum(a.owned)::int as owned
from allx a
join public.website_products wp on wp.equipment_type_id = a.equipment_type_id and wp.is_published
join public.branches b on b.id = a.branch_id
group by 1, 2;

revoke all on public.website_product_stock_public from anon, public;
grant select on public.website_product_stock_public to authenticated;
