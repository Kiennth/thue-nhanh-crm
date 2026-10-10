-- CEO 10/10: thêm lựa chọn "Ngoại tỉnh" (khách không ở HN / ĐN / TP HCM) ở ô
-- tìm trang chủ + báo giá web. Luôn là giao tận nơi (pickup_key 'ship'),
-- ship_city = 'tinh'; phí gửi xe / chuyển phát Thuê Nhanh báo qua Zalo, kho
-- gửi đi do nhân viên chọn khi Lên đơn.
alter table public.website_orders drop constraint if exists website_orders_ship_city_check;
alter table public.website_orders
  add constraint website_orders_ship_city_check check (ship_city in ('hcm', 'hn', 'dn', 'tinh'));

-- website_submit_order: nhận ship_city 'tinh' (chỉ sửa đúng điều kiện kiểm tra,
-- phần còn lại giữ nguyên bản 20261009100000).
do $mig$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'website_submit_order';
  if position('v_ship_city not in (''hcm'', ''hn'', ''dn'')' in d) = 0 then
    raise exception 'website_submit_order: không thấy điều kiện ship_city cần sửa';
  end if;
  d := replace(d, 'v_ship_city not in (''hcm'', ''hn'', ''dn'')', 'v_ship_city not in (''hcm'', ''hn'', ''dn'', ''tinh'')');
  execute d;
end
$mig$;

notify pgrst, 'reload schema';
