-- CEO 2026-08-04: "chuyển lịch sử thuê của Android TV Box 4K (SL) qua
-- Android TV Box 4K" — SKU cũ theo số lượng, deposit không đổi
-- (500.000đ cả 2 bên). SKU cũ có 1 bản ghi equipment_purchases thật
-- (mua CellphoneS, 1.850.000đ, 26/7/2026) — chuyển thông tin mua hàng
-- này sang trực tiếp trên serial mới (purchase_price/purchase_date/
-- branch_id/condition_notes) vì equipment_purchases chỉ theo dõi biến
-- thể theo số lượng, không có cột cho serial riêng lẻ.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_unit_id uuid;
  v_purchase record;
  v_inst_id uuid;
  v_multi record;
  i integer;
begin
  select id into v_old_type_id from public.equipment_types where name = 'Android TV Box 4K (SL)';
  select id into v_new_type_id from public.equipment_types where name = 'Android TV Box 4K';

  if v_old_type_id is null or v_new_type_id is null then
    return;
  end if;

  for v_multi in
    select id, order_id, quantity, unit_price, equipment_unit_id from public.order_equipment
    where equipment_type_id = v_old_type_id and quantity > 1
  loop
    update public.order_equipment set quantity = 1, line_total = v_multi.unit_price where id = v_multi.id;
    for i in 2..v_multi.quantity loop
      insert into public.order_equipment (order_id, equipment_type_id, equipment_unit_id, quantity, unit_price, line_total)
      values (v_multi.order_id, v_old_type_id, v_multi.equipment_unit_id, 1, v_multi.unit_price, v_multi.unit_price);
    end loop;
  end loop;

  insert into public.equipment_instances (equipment_type_id, identifier_code, status)
  values (v_new_type_id, 'ANDROIDTVBOX-01', 'available')
  returning id into v_inst_id;

  update public.order_equipment
  set equipment_type_id = v_new_type_id, equipment_unit_id = null, equipment_instance_id = v_inst_id
  where equipment_type_id = v_old_type_id;

  select id into v_unit_id from public.equipment_units where equipment_type_id = v_old_type_id limit 1;

  select * into v_purchase from public.equipment_purchases where equipment_unit_id = v_unit_id limit 1;
  if v_purchase.id is not null then
    update public.equipment_instances
    set purchase_price = v_purchase.unit_cost, purchase_date = v_purchase.purchase_date,
        branch_id = v_purchase.branch_id, condition_notes = v_purchase.note
    where id = v_inst_id;
    delete from public.equipment_purchases where id = v_purchase.id;
  end if;

  delete from public.equipment_instances where equipment_type_id = v_old_type_id;
  delete from public.equipment_stock where equipment_unit_id = v_unit_id;
  delete from public.equipment_units where equipment_type_id = v_old_type_id;
  delete from public.equipment_types where id = v_old_type_id;
end $$;
