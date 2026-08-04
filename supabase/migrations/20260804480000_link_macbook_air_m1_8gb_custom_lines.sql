-- CEO 2026-08-04: "chuyển lịch sử thuê của [EOL] MacBook Air 13 inch M1
-- bên Booqable sang cho MacBook Air 13 inch M1 8GB RAM bên CRM mới".
-- Đối chiếu Booqable API phát hiện sản phẩm này thực ra gộp CHUNG 3
-- biến thể RAM/dung lượng khác nhau (8GB/256GB, 16GB/256GB,
-- 16GB/512GB) trong cùng 1 SKU Booqable — chỉ gắn đúng biến thể
-- "8GB, 256GB" (38 dòng, 44 SL, 61.565.000đ) vào "MacBook Air 13 inch
-- M1 8GB RAM" như CEO yêu cầu. 2 biến thể 16GB còn lại (63 dòng, 68 SL)
-- CỐ TÌNH chưa gắn — chờ CEO xác nhận đích đến đúng (CRM đã có sẵn
-- type "MacBook Air 13-inch M1 16GB RAM" nhưng chưa rõ có đúng ý CEO
-- không, và còn phải tách theo 256GB/512GB nữa).
do $$
declare
  v_type_id uuid;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_type_id from public.equipment_types where name = 'MacBook Air 13 inch M1 8GB RAM';
  if v_type_id is null then
    return;
  end if;

  select id into v_inst_id from public.equipment_instances
  where equipment_type_id = v_type_id and status = 'available' limit 1;
  if v_inst_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price from public.order_equipment
    where custom_name = '[EOL] MacBook Air 13 inch M1   - 8GB, 256GB' and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, custom_name, quantity, unit_price, line_total)
      values (v_multi.order_id, '[EOL] MacBook Air 13 inch M1   - 8GB, 256GB', 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  update public.order_equipment
  set equipment_type_id = v_type_id, custom_name = null, equipment_instance_id = v_inst_id
  where custom_name = '[EOL] MacBook Air 13 inch M1   - 8GB, 256GB';
end $$;
