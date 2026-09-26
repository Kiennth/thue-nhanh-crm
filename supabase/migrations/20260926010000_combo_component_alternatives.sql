-- Món thay thế trong combo (CEO 2026-09-26, Combo Podcast Shure MV7X): 1 món
-- con có thể là "Zoom H4N hoặc H6, tuỳ máy nào có sẵn". Món chính vẫn nằm ở
-- equipment_type_components.component_type_id (ưu tiên 1); bảng này là các
-- lựa chọn tiếp theo theo thứ tự position. Thêm combo vào đơn thì lấy máy
-- trống theo đúng thứ tự đó tại kho giao.

create table public.equipment_type_component_alternatives (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.equipment_type_components(id) on delete cascade,
  alternative_type_id uuid not null references public.equipment_types(id) on delete restrict,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (component_id, alternative_type_id)
);

create index equipment_type_component_alternatives_component_idx
  on public.equipment_type_component_alternatives (component_id);

alter table public.equipment_type_component_alternatives enable row level security;

create policy "equipment_type_component_alternatives_select" on public.equipment_type_component_alternatives
  for select to authenticated using (public.is_employee());
create policy "equipment_type_component_alternatives_insert" on public.equipment_type_component_alternatives
  for insert to authenticated with check (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_type_component_alternatives_update" on public.equipment_type_component_alternatives
  for update to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
create policy "equipment_type_component_alternatives_delete" on public.equipment_type_component_alternatives
  for delete to authenticated using (public.auth_role() in ('giam_doc', 'admin', 'ke_toan'));
