-- CEO 2026-08-05: "PC Ultra7 265K | 64GB RAM | RTX 4070 12GB chỉ còn 1
-- cái ở TP HCM nhé" — sửa lại migration 20260804930000 (lúc đó tạo tạm
-- 30 instance theo mẫu chung 10/10/10 vì chưa có số thật). Gộp cả 4 dòng
-- order_equipment về đúng 1 instance duy nhất tại TP HCM, xoá 29 instance
-- thừa.
do $$
declare
  v_type_id uuid;
  v_keep_id uuid;
begin
  select id into v_type_id from public.equipment_types where name = 'PC Ultra7 265K | 64GB RAM | RTX 4070 12GB';
  if v_type_id is null then
    return;
  end if;

  select id into v_keep_id from public.equipment_instances
  where equipment_type_id = v_type_id and identifier_code = 'PCULTRA7-265K-HCM-01';

  update public.order_equipment
  set equipment_instance_id = v_keep_id
  where equipment_type_id = v_type_id;

  delete from public.equipment_instances
  where equipment_type_id = v_type_id and id <> v_keep_id;
end $$;
