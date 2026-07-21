-- =============================================================================
-- Cập nhật công thức tính khoán: 8 khâu → 10 khâu, kèm % khoán mỗi khâu.
-- order_tasks/task_weights chưa có UI/dữ liệu (engine tính khoán làm ở lượt
-- sau) nên chỉ cần đổi enum + seed lại task_weights, không cần migrate dữ liệu.
-- =============================================================================

alter type public.task_type rename to task_type_old;

create type public.task_type as enum (
  'tiep_nhan_yeu_cau',
  'bao_gia',
  'chot_don',
  'ky_hop_dong_thu_coc',
  'chuan_bi',
  'giao_hang_ban_giao',
  'van_hanh_xu_ly_su_co',
  'thu_hoi',
  'nghiem_thu',
  'nhap_kho_bao_tri'
);

alter table public.order_tasks
  alter column task_type type public.task_type using task_type::text::public.task_type;

alter table public.task_weights
  alter column task_type type public.task_type using task_type::text::public.task_type;

drop type public.task_type_old;

insert into public.task_weights (task_type, weight_percentage) values
  ('tiep_nhan_yeu_cau', 5),
  ('bao_gia', 5),
  ('chot_don', 10),
  ('ky_hop_dong_thu_coc', 10),
  ('chuan_bi', 15),
  ('giao_hang_ban_giao', 15),
  ('van_hanh_xu_ly_su_co', 15),
  ('thu_hoi', 5),
  ('nghiem_thu', 10),
  ('nhap_kho_bao_tri', 10)
on conflict (task_type) do update set weight_percentage = excluded.weight_percentage;
