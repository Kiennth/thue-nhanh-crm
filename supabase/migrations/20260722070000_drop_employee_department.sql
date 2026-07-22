-- Bỏ trường "Phòng ban" — chỉ là text tự do không gắn với logic nghiệp vụ
-- nào (phân quyền dùng role, không dùng department), người dùng yêu cầu bỏ.
drop view public.employees_public;

alter table public.employees drop column department;

create view public.employees_public as
  select id, name, branch_id, role, is_active
  from public.employees;

grant select on public.employees_public to authenticated;
