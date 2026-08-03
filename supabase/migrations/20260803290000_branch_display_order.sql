-- CEO 2026-08-03: sắp xếp chi nhánh theo thứ tự cố định Hà Nội > TP HCM >
-- Đà Nẵng > HQ ở mọi nơi hiển thị (chọn chi nhánh, bảng tồn kho...) thay
-- vì sắp theo tên (vốn không đúng thứ tự mong muốn). Chi nhánh mới tạo
-- sau này không set position sẽ tự xếp cuối (NULLS LAST là mặc định của
-- ORDER BY ... ASC trong Postgres).
alter table public.branches add column position integer;

update public.branches set position = 1 where name = 'Hà Nội';
update public.branches set position = 2 where name = 'TP HCM';
update public.branches set position = 3 where name = 'Đà Nẵng';
update public.branches set position = 4 where name = 'HQ';
