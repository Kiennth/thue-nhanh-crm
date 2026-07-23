-- =============================================================================
-- Ảnh đại diện thiết bị — lưu trong Supabase Storage bucket public
-- "equipment-images", đường dẫn public lưu vào equipment_types.image_url.
-- Bucket public để hiển thị ảnh trực tiếp không cần ký URL; chỉ Admin/Kế
-- toán mới upload/xoá được, giống mọi quyền quản lý thiết bị khác.
-- =============================================================================

alter table public.equipment_types add column image_url text;

insert into storage.buckets (id, name, public)
values ('equipment-images', 'equipment-images', true)
on conflict (id) do nothing;

create policy "equipment_images_select_public" on storage.objects
  for select to public using (bucket_id = 'equipment-images');

create policy "equipment_images_insert_admin_ketoan" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'equipment-images' and public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_images_update_admin_ketoan" on storage.objects
  for update to authenticated
  using (bucket_id = 'equipment-images' and public.auth_role() in ('admin', 'ke_toan'))
  with check (bucket_id = 'equipment-images' and public.auth_role() in ('admin', 'ke_toan'));

create policy "equipment_images_delete_admin_ketoan" on storage.objects
  for delete to authenticated
  using (bucket_id = 'equipment-images' and public.auth_role() in ('admin', 'ke_toan'));
