-- BQ11779: tick xong "Nhập kho & bảo trì" nhưng hàng hoá vẫn kẹt ở "Đang cho
-- thuê" trong trang chi tiết hàng hoá. Đối chiếu thấy return_stock_transferred_at
-- vẫn null dù delivery_stock_moved_at đã có — nghĩa là lúc tick khâu cuối,
-- RPC return_order_stock() đã CHẠY LỖI nhưng lỗi bị nuốt im lặng (xem
-- updateTaskCompletion() trong src/lib/actions/orders.ts, sắp sửa kèm migration
-- sau để không bị vậy nữa). Rà toàn hệ thống thấy thêm đúng 1 đơn nữa cùng
-- cảnh: BQ32 (kẹt từ lúc import Booqable 2026-07-24) — dòng hàng của nó chỉ
-- có custom_name (không gắn equipment_type_id) nên vốn dĩ không có gì để trả
-- kho, chỉ cần đánh dấu lại cho khỏi hiện sai.
--
-- Tái hiện đúng logic return_order_stock() (di chuyển picked_up -> in_stock
-- cùng chi nhánh vì pickup_branch_id = return_branch_id ở cả 2 đơn), số
-- lượng move đã đối chiếu khớp CHÍNH XÁC với order_equipment.quantity của
-- từng dòng — không có dòng nào bị cắt bớt do thiếu tồn.

begin;

-- BQ11779 — 9 dòng equipment_unit_id, chi nhánh Hà Nội (pickup = return)
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = '00050c5f-30de-40a5-aad6-3ade82f10945' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 3, quantity_in_stock = quantity_in_stock + 3
  where equipment_unit_id = 'f59ae502-507c-4149-9e47-84c5da4f31b3' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 8, quantity_in_stock = quantity_in_stock + 8
  where equipment_unit_id = '8e472ca2-c687-47f6-ba2e-00dd7c19cd87' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = 'b40612f1-a36b-413e-a068-1a144afb447a' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = 'b72b1459-7311-4b2e-8ab6-cdb0978cdf3e' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = 'a4a9c5b8-0506-4eef-8c7c-ae38f9d6c104' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = 'f9f7878d-9b03-435a-901c-8a8cccf0cb4a' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 4, quantity_in_stock = quantity_in_stock + 4
  where equipment_unit_id = 'b1d60ff0-3672-4397-bbad-b7438b1d4127' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';
update public.equipment_stock set quantity_picked_up = quantity_picked_up - 1, quantity_in_stock = quantity_in_stock + 1
  where equipment_unit_id = 'b3c28cc1-bae5-476b-9007-dca935a02c31' and branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0';

-- BQ11779 — 1 dòng equipment_instance_id (điện thoại theo dõi riêng lẻ)
update public.equipment_instances
  set status = 'available', branch_id = 'a877af86-9936-4dc2-b257-95bb49026cd0'
  where id = '7fe28009-3fc7-43f0-8f9a-8c761a4d540c';

update public.orders set return_stock_transferred_at = now()
  where order_code = 'BQ11779' and return_stock_transferred_at is null;

-- BQ32 — không có dòng equipment_unit_id/equipment_instance_id nào, chỉ
-- cần đánh dấu lại cho khỏi hiện kẹt.
update public.orders set return_stock_transferred_at = now()
  where order_code = 'BQ32' and return_stock_transferred_at is null;

commit;
