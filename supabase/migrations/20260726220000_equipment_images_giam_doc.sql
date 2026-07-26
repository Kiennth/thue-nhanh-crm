-- Migration 20260727000000_role_hierarchy.sql thêm vai trò giam_doc vào mọi
-- policy quản lý thiết bị ở bảng public.equipment_types/equipment_units,
-- nhưng bỏ sót policy trên storage.objects cho bucket "equipment-images"
-- (tạo ở 20260723020000_equipment_images.sql) — vẫn chỉ cho phép
-- ('admin','ke_toan'), khiến Giám đốc bị chặn khi upload/sửa/xoá ảnh thiết bị
-- với lỗi "new row violates row-level security policy". Cập nhật lại cho
-- khớp MANAGE_ROLES (giam_doc, admin, ke_toan) hiện tại.

drop policy if exists "equipment_images_insert_admin_ketoan" on storage.objects;
drop policy if exists "equipment_images_update_admin_ketoan" on storage.objects;
drop policy if exists "equipment_images_delete_admin_ketoan" on storage.objects;

create policy "equipment_images_insert_admin_ketoan" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'equipment-images' and public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create policy "equipment_images_update_admin_ketoan" on storage.objects
  for update to authenticated
  using (bucket_id = 'equipment-images' and public.auth_role() in ('giam_doc', 'admin', 'ke_toan'))
  with check (bucket_id = 'equipment-images' and public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));

create policy "equipment_images_delete_admin_ketoan" on storage.objects
  for delete to authenticated
  using (bucket_id = 'equipment-images' and public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
