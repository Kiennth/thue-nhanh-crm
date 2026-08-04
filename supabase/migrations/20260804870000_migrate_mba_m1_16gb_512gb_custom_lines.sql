-- CEO 2026-08-04: "[EOL] MacBook Air 13 inch M1 - 16GB, 512GB chính là
-- MacBook Air 13-inch M1 16GB RAM" — 26 dòng order_equipment mồ côi (toàn
-- quantity=1), tổng 84.735.000đ. 2 đơn đang mở: BQ4830 đã đóng băng cọc từ
-- trước (17.000.000đ, không đụng lại), BQ11295 đóng băng mới (0đ, vì
-- trước đó chưa có dòng rental nào tính cọc trên đơn này). Không nêu màu
-- (khác 256GB có Gold) và khác dung lượng với batch 256GB đã gắn trước —
-- tạo mới 2 instance RIÊNG (MBAM1-16GB-06/07), không dùng chung với các
-- instance của batch 256GB để tránh gán lẫn lịch sử giữa 2 dung lượng
-- khác nhau vào cùng 1 "máy" giả định.
do $$
declare
  v_type_id uuid;
  v_inst_ids uuid[] := '{}';
  v_inst_id uuid;
  v_code text;
  v_order record;
  v_line record;
  v_cursor integer := 0;
  v_pos integer;
begin
  update public.orders set deposit_override_amount = 0
  where order_code = 'BQ11295' and deposit_override_amount is null;

  select id into v_type_id from public.equipment_types where name = 'MacBook Air 13-inch M1 16GB RAM';
  if v_type_id is null then
    return;
  end if;

  for v_code in select unnest(array['MBAM1-16GB-06', 'MBAM1-16GB-07']) loop
    insert into public.equipment_instances (equipment_type_id, identifier_code, status)
    values (v_type_id, v_code, 'available')
    returning id into v_inst_id;
    v_inst_ids := array_append(v_inst_ids, v_inst_id);
  end loop;

  for v_order in
    select distinct order_id from public.order_equipment
    where custom_name = '[EOL] MacBook Air 13 inch M1   - 16GB, 512GB'
    order by order_id
  loop
    v_pos := 0;
    for v_line in
      select id from public.order_equipment
      where custom_name = '[EOL] MacBook Air 13 inch M1   - 16GB, 512GB' and order_id = v_order.order_id
      order by id
    loop
      update public.order_equipment
      set equipment_type_id = v_type_id,
          custom_name = null,
          equipment_instance_id = v_inst_ids[((v_cursor + v_pos) % 2) + 1]
      where id = v_line.id;
      v_pos := v_pos + 1;
    end loop;
    v_cursor := v_cursor + v_pos;
  end loop;
end $$;
