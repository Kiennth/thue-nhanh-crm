-- Chỉ mục còn thiếu (Grok CRM 09/10 §A.3, đối chiếu pg_indexes thật):
--   * order_equipment.equipment_instance_id — tra "máy đang ở đơn nào" (đếm
--     máy rảnh, xung đột lịch, trang máy, Tạo đơn).
--   * equipment_instances theo loại / biến thể / trạng thái + kho — trang thiết
--     bị, danh mục Tạo đơn, kiểm kho.
--   * orders.rental_start_at / rental_end_at — chế độ xem nhanh Giao hôm nay /
--     Trả hôm nay / Quá hạn, Lịch.
-- Bảng nhỏ (vài chục nghìn dòng) → tạo thường, khoá ghi < 1 giây.
create index if not exists order_equipment_instance_idx
  on public.order_equipment (equipment_instance_id) where equipment_instance_id is not null;
create index if not exists equipment_instances_type_idx on public.equipment_instances (equipment_type_id);
create index if not exists equipment_instances_unit_idx on public.equipment_instances (equipment_unit_id);
create index if not exists equipment_instances_status_branch_idx on public.equipment_instances (status, branch_id);
create index if not exists orders_rental_start_idx on public.orders (rental_start_at);
create index if not exists orders_rental_end_idx on public.orders (rental_end_at);
