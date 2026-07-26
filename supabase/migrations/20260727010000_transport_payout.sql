-- Khoán trực tiếp cho phí vận chuyển (giao/thu hồi bằng xe máy) — khác 3 SKU
-- dịch vụ cũ (Lắp đặt/Tháo dỡ/Support) có %payout CỐ ĐỊNH trên equipment_types,
-- phí vận chuyển có %payout ĐỘNG tuỳ giờ hẹn trên đơn (rental_start_at/
-- rental_end_at) và cách nhân viên thực hiện — xem computeTransportPayoutPercentage()
-- trong src/lib/commission.ts. Vì vậy 2 SKU này KHÔNG được set payout_percentage
-- (giữ null), được nhận diện bằng id cứng trong code (giống
-- SERVICE_LINE_CATEGORY_BY_TYPE_ID).

-- 1. Gộp SKU trùng: mỗi chiều giao/thu hồi xe máy đang có 2 SKU cùng nghĩa do
-- lịch sử nhập liệu — 1 cái song ngữ tạo sau (dùng cho tuyệt đại đa số đơn),
-- 1 cái "(lượt)" tạo trước (chỉ dính vài đơn lẻ). Dồn toàn bộ order_equipment
-- đang trỏ SKU "(lượt)" sang SKU song ngữ, rồi xoá SKU "(lượt)".
update public.order_equipment
set equipment_type_id = '38f5c644-3898-4b1f-a3f5-901e55f77c6a' -- Bike Delivery (giữ lại)
where equipment_type_id = 'c5c8841a-85d7-42f0-9ccd-b4f960612abd'; -- Phí giao hàng bằng xe máy (lượt) — gộp vào trên

update public.order_equipment
set equipment_type_id = '13c85fe0-8b13-4d76-9df5-a20b19598cc9' -- Bike Collection (giữ lại)
where equipment_type_id = '751471a7-6017-477c-8820-9821d5737239'; -- Phí thu hồi bằng xe máy (lượt) — gộp vào trên

delete from public.equipment_types
where id in ('c5c8841a-85d7-42f0-9ccd-b4f960612abd', '751471a7-6017-477c-8820-9821d5737239');

-- 2. Đổi tên cho rõ nghĩa — bỏ chữ "dịch vụ" (dễ hiểu lầm là luôn thuê ngoài,
-- trong khi thực tế có thể nhân viên tự chạy xe máy đi giao/thu hồi).
update public.equipment_types set name = 'Phí giao hàng bằng xe máy | Bike Delivery'
  where id = '38f5c644-3898-4b1f-a3f5-901e55f77c6a';
update public.equipment_types set name = 'Phí thu hồi bằng xe máy | Bike Collection'
  where id = '13c85fe0-8b13-4d76-9df5-a20b19598cc9';

-- 3. Cách nhân viên thực hiện lượt giao/thu hồi — cùng với giờ hẹn trên đơn,
-- quyết định %payout (xem computeTransportPayoutPercentage()). NULL = chưa
-- xác định (chưa gán ai/chưa chọn cách thực hiện), không phát sinh khoán.
create type public.delivery_method as enum ('self_ride', 'external_service');

alter table public.order_equipment
  add column delivery_method public.delivery_method;
