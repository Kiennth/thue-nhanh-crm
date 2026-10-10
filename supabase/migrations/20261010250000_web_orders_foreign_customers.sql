-- CEO 10/10: khách nước ngoài (vd Indonesia) không đặt được đơn web — SĐT
-- +62 … dài 12–13 số bị chặn (cũ 9–12 số) và khách lẻ bắt CCCD 9/12 số.
-- Mở: SĐT 8–15 chữ số (chuẩn quốc tế E.164, cho phép dấu + và khoảng trắng);
-- khách lẻ nhận CCCD 9/12 số HOẶC hộ chiếu / giấy tờ nước ngoài 5–20 ký tự
-- chữ + số. Chỉ sửa 2 điều kiện, phần còn lại của website_submit_order giữ nguyên.
do $mig$
declare
  d text;
  a1 text := 'not between 9 and 12 or length(v_phone) > 20';
  b1 text := 'not between 8 and 15 or length(v_phone) > 24';
  a2 text := 'if v_type = ''individual'' and length(v_taxd) not in (9, 12) then';
  b2 text := 'if v_type = ''individual'' and length(v_taxd) not in (9, 12) and v_tax !~ ''^[A-Za-z0-9][A-Za-z0-9 .-]{4,19}$'' then';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'website_submit_order';
  if position(a1 in d) = 0 or position(a2 in d) = 0 then
    raise exception 'website_submit_order: không thấy điều kiện SĐT / CCCD cần sửa';
  end if;
  d := replace(replace(d, a1, b1), a2, b2);
  execute d;
end
$mig$;

notify pgrst, 'reload schema';
