-- ---------------------------------------------------------------------
-- Chống trùng lịch thiết bị (CEO 2026-08-09): tồn kho chỉ bị trừ lúc GIAO
-- (khâu 6) nên nhiều đơn tương lai có thể hứa cùng một món mà không ai
-- biết — tới ngày giao mới vỡ lở. RPC này tính cho 1 đơn: với từng loại
-- hàng CHO THUÊ trên đơn, đếm các đơn khác CÙNG CHI NHÁNH GIAO còn hoạt
-- động (chưa huỷ, chưa hoàn tất) có khoảng thuê CHỒNG LẤN — nếu tổng nhu
-- cầu vượt tồn kho chi nhánh thì trả về 1 dòng xung đột kèm danh sách
-- đơn cạnh tranh, để trang chi tiết đơn hiện cảnh báo đỏ ngay sau mỗi
-- lần thêm dòng/đổi ngày.
--
-- Chỉ CẢNH BÁO, không chặn lưu — thực tế có lúc cố tình nhận đơn vượt
-- kho (biết sẽ điều hàng chi nhánh khác về kịp); quyền quyết ở người.
--
-- Chống nhiễu (rút từ lần quét thử đầu tiên ra 51 đơn cắm cờ — đa số là
-- đơn cũ trễ hạn hoặc hàng đăng ký ở chi nhánh khác):
--   - Chỉ xét đơn có rental_end_at >= now() — đơn quá hạn lâu không cần
--     cảnh báo trùng lịch nữa (đã có badge Trễ hạn riêng).
--   - Sức chứa tính KHO TOÀN CÔNG TY (không lọc chi nhánh) — thực tế
--     vẫn điều hàng giữa chi nhánh trước ngày giao, lọc theo chi nhánh
--     giao sẽ kêu oan liên tục. Đơn cạnh tranh cũng tính mọi chi nhánh
--     (cùng tranh một pool hàng).
--
-- Sức chứa = tồn kho biến thể (equipment_stock, mọi tracking_type) +
-- số máy serialized chưa thanh lý (CHỈ type tracking individual — cùng
-- qui ước chống đếm đè instance mồ côi như equipment_page_report).
-- SECURITY INVOKER — đi theo RLS của người gọi.
-- ---------------------------------------------------------------------

create or replace function public.order_schedule_conflicts(p_order_id uuid)
returns table (
  equipment_type_id uuid,
  equipment_type_name text,
  capacity numeric,
  my_quantity numeric,
  others_quantity numeric,
  conflicting_orders jsonb
)
language sql
stable
set search_path = public
as $$
with me as (
  select id, rental_start_at, rental_end_at
  from orders
  where id = p_order_id
    and cancelled_at is null
    and completed_at is null
    and rental_start_at is not null
    and rental_end_at is not null
    and rental_end_at >= now()
),
my_lines as (
  select oe.equipment_type_id, sum(oe.quantity) as qty
  from order_equipment oe
  join equipment_types t on t.id = oe.equipment_type_id and t.product_type = 'rental'
  where oe.order_id = p_order_id
    and oe.equipment_type_id is not null
  group by oe.equipment_type_id
),
other_lines as (
  select oe.equipment_type_id,
         o.id as order_id, o.order_code, o.rental_start_at, o.rental_end_at,
         sum(oe.quantity) as qty
  from orders o
  join order_equipment oe on oe.order_id = o.id
  cross join me
  where o.id <> me.id
    and o.cancelled_at is null
    and o.completed_at is null
    and o.rental_start_at is not null
    and o.rental_end_at is not null
    and o.rental_start_at < me.rental_end_at
    and o.rental_end_at > me.rental_start_at
    and oe.equipment_type_id in (select ml.equipment_type_id from my_lines ml)
  group by oe.equipment_type_id, o.id, o.order_code, o.rental_start_at, o.rental_end_at
),
capacity as (
  select ml.equipment_type_id,
         coalesce((
           select sum(es.quantity_total)
           from equipment_stock es
           join equipment_units u on u.id = es.equipment_unit_id
           where u.equipment_type_id = ml.equipment_type_id
         ), 0)
         + coalesce((
           select count(*)
           from equipment_instances i
           join equipment_types t on t.id = i.equipment_type_id and t.tracking_type = 'individual'
           where i.equipment_type_id = ml.equipment_type_id
             and i.status <> 'disposed'
         ), 0) as total_qty
  from my_lines ml
)
select
  ml.equipment_type_id,
  t.name as equipment_type_name,
  c.total_qty as capacity,
  ml.qty as my_quantity,
  coalesce(sum(ol.qty), 0) as others_quantity,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderId', ol.order_id,
        'orderCode', ol.order_code,
        'rentalStartAt', ol.rental_start_at,
        'rentalEndAt', ol.rental_end_at,
        'quantity', ol.qty
      ) order by ol.rental_start_at
    ) filter (where ol.order_id is not null),
    '[]'::jsonb
  ) as conflicting_orders
from my_lines ml
join equipment_types t on t.id = ml.equipment_type_id
join capacity c on c.equipment_type_id = ml.equipment_type_id
left join other_lines ol on ol.equipment_type_id = ml.equipment_type_id
group by ml.equipment_type_id, t.name, c.total_qty, ml.qty
having ml.qty + coalesce(sum(ol.qty), 0) > c.total_qty;
$$;

revoke all on function public.order_schedule_conflicts(uuid) from anon;
