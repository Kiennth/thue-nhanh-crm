-- CEO 2026-08-04: sửa sai — "EOL 13" bên Booqable (2 đơn BQ95, BQ329)
-- trước đó bị gắn nhầm vào "iPad Air 5 M1 10.9 inch" (dựa theo hướng
-- dẫn ban đầu qua chat). CEO xác nhận lại qua đối chiếu Booqable: EOL 13
-- đúng ra là "iPad Air 4 10.9-inch". Chỉ chuyển đúng 2 dòng này sang
-- type + serial đúng (AIR4-SG-01) — 2 serial cũ (F7140GQ7G0,
-- H9NVJ140D7) là serial thật của rất nhiều đơn khác thuộc iPad Air 5 M1
-- nên không đụng tới, không xoá.
do $$
declare
  v_new_type_id uuid;
  v_new_inst_id uuid;
begin
  select id into v_new_type_id from public.equipment_types where name = 'iPad Air 4 10.9-inch';
  if v_new_type_id is null then
    return;
  end if;

  select id into v_new_inst_id from public.equipment_instances
  where equipment_type_id = v_new_type_id and status = 'available' limit 1;

  update public.order_equipment oe
  set equipment_type_id = v_new_type_id, equipment_instance_id = v_new_inst_id
  from public.orders o
  where oe.order_id = o.id and o.order_code in ('BQ95', 'BQ329')
    and oe.equipment_type_id = (select id from public.equipment_types where name = 'iPad Air 5 M1 10.9 inch');
end $$;
