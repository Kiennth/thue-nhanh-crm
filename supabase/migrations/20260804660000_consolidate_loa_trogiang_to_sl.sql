-- CEO 2026-08-04: "chuyển toàn bộ lịch sử thuê của Loa trợ giảng về
-- sản phẩm Loa trợ giảng (SL)" — đổi ý, gộp ngược lại về bản theo số
-- lượng thay vì serialize (đã có sẵn 62 dòng lịch sử cũ + 3 unit theo
-- hãng: STARGO, TAKSTAR, SEEONE — CEO vừa tạo thêm biến thể SEEONE).
-- Chuyển 20 dòng từ type "Loa trợ giảng" (theo từng sản phẩm, mới gắn
-- STARGO+TAKSTAR hôm nay) sang đúng unit hãng tương ứng ở "(SL)", xoá
-- type theo từng sản phẩm sau khi rỗng.
--
-- Đồng thời: "[EOL] Seeone S901 UHF là Loa trợ giảng (SL), biến thể
-- Seeone" — gắn nốt 2 dòng vào unit SEEONE.
do $$
declare
  v_old_type_id uuid;
  v_new_type_id uuid;
  v_stargo_unit uuid;
  v_takstar_unit uuid;
  v_seeone_unit uuid;
  v_stargo_inst uuid;
  v_takstar_inst uuid;
  v_line record;
begin
  select id into v_old_type_id from public.equipment_types
  where name = 'Loa trợ giảng' and tracking_type = 'individual';
  select id into v_new_type_id from public.equipment_types where name = 'Loa trợ giảng (SL)';

  select id into v_stargo_unit from public.equipment_units where equipment_type_id = v_new_type_id and brand_model ilike '%stargo%';
  select id into v_takstar_unit from public.equipment_units where equipment_type_id = v_new_type_id and brand_model ilike '%takstar%';
  select id into v_seeone_unit from public.equipment_units where equipment_type_id = v_new_type_id and brand_model ilike '%seeone%';

  if v_old_type_id is not null and v_new_type_id is not null then
    select id into v_stargo_inst from public.equipment_instances where equipment_type_id = v_old_type_id and identifier_code = 'LOATROGIANG-STARGO-01';
    select id into v_takstar_inst from public.equipment_instances where equipment_type_id = v_old_type_id and identifier_code = 'LOATROGIANG-TAKSTAR-01';

    for v_line in
      select id, equipment_instance_id from public.order_equipment where equipment_type_id = v_old_type_id
    loop
      update public.order_equipment
      set equipment_type_id = v_new_type_id, equipment_instance_id = null,
          equipment_unit_id = case when v_line.equipment_instance_id = v_stargo_inst then v_stargo_unit else v_takstar_unit end
      where id = v_line.id;
    end loop;

    delete from public.equipment_instances where equipment_type_id = v_old_type_id;
    delete from public.equipment_units where equipment_type_id = v_old_type_id;
    delete from public.equipment_types where id = v_old_type_id;
  end if;

  if v_seeone_unit is not null then
    update public.order_equipment
    set equipment_type_id = v_new_type_id, custom_name = null, equipment_unit_id = v_seeone_unit
    where custom_name = '[EOL] Seeone S901 UHF';
  end if;
end $$;
