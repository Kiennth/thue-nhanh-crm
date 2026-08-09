-- ---------------------------------------------------------------------
-- Tối ưu tốc độ (CEO 2026-08-09): soi pg_indexes phát hiện các bảng nóng
-- gần như KHÔNG có index ngoài khoá chính — mọi lọc đều quét cả bảng:
--   - order_equipment (~40k dòng): chỉ có pkey. Bị lọc theo completed_date
--     (lương tháng), order_id (gom dòng theo đơn — fetchRowsByIds +
--     equipment_page_report), equipment_type_id (tab Doanh thu thiết bị),
--     employee_id (hiệu suất cá nhân). Đo thực tế: query lọc tháng chậm
--     gấp ~2 lần baseline mạng.
--   - order_tasks (~120k dòng): chỉ có pkey + unique(order_id, task_type).
--     Lọc completed_date (lương tháng) + employee_id (khoán cá nhân) đều
--     seq scan — query chậm nhất trong cụm tính lương (950ms vs ~400ms
--     baseline khi đo từ ngoài).
--   - orders (~12k dòng): chỉ có pkey + unique(order_code). Mọi RPC/báo
--     cáo lọc order_date/customer_id/branch — bảng nhỏ nên chưa "cháy"
--     nhưng index rẻ và mọi trang đều đi qua.
-- order_payments/expenses/overtime_entries đã có index sẵn — không đụng.
-- Chỉ CREATE INDEX, không đổi hành vi — an toàn tuyệt đối với dữ liệu.
-- ---------------------------------------------------------------------

create index if not exists order_equipment_order_id_idx on public.order_equipment (order_id);
create index if not exists order_equipment_completed_date_idx on public.order_equipment (completed_date);
create index if not exists order_equipment_equipment_type_id_idx on public.order_equipment (equipment_type_id);
create index if not exists order_equipment_employee_id_idx on public.order_equipment (employee_id);

create index if not exists order_tasks_completed_date_idx on public.order_tasks (completed_date);
create index if not exists order_tasks_employee_id_idx on public.order_tasks (employee_id);

create index if not exists orders_order_date_idx on public.orders (order_date);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_pickup_branch_id_idx on public.orders (pickup_branch_id);
create index if not exists orders_return_branch_id_idx on public.orders (return_branch_id);
