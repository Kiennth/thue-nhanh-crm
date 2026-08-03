-- CEO 2026-08-04: "chuyển lịch sử thuê của [KHÔNG DÙNG] | ACER4K bên
-- booqable sang cho mã Màn hình 4K 32-inch, biến thể ACER trên CRM mới"
-- — đối chiếu qua Booqable API phát hiện cùng 1 màn hình Acer B326HK
-- 4K IPS nhưng bị import với 2 tên tự do khác nhau trong CRM (1 tên
-- tiếng Việt dễ đọc, 1 tên đúng nguyên văn SKU Booqable) — gộp cả 2 về
-- 2 serial thật đã có sẵn (ACER-HN-01, ACER-SG-01), không đụng tới
-- serial MANHINH4K32-01 (dành riêng cho Samsung M7).
do $$
declare
  v_type_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'Màn hình 4K 32-inch';
  if v_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price, custom_name from public.order_equipment
    where custom_name in ('Màn Hình 4K IPS 32-inch - Acer B326HK', '[KHÔNG DÙNG] | ACER4K - ACER_B326HK_4K_IPS')
      and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, v_multi.custom_name, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  with lines as (
    select id, row_number() over (order by created_at, id) - 1 as rn
    from public.order_equipment
    where custom_name in ('Màn Hình 4K IPS 32-inch - Acer B326HK', '[KHÔNG DÙNG] | ACER4K - ACER_B326HK_4K_IPS')
  ),
  instances as (
    select id, row_number() over (order by identifier_code) - 1 as rn, count(*) over () as total
    from public.equipment_instances
    where equipment_type_id = v_type_id and identifier_code in ('ACER-HN-01', 'ACER-SG-01')
  )
  update public.order_equipment oe
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = ins.id
  from lines l join instances ins on ins.rn = l.rn % ins.total
  where oe.id = l.id;
end $$;
