-- ---------------------------------------------------------------------
-- /equipment và /branches/[id] tính doanh thu/lượt thuê/tồn kho/giá trị tồn
-- kho từng loại hàng bằng cách kéo NGUYÊN order_equipment (30.000+ dòng,
-- không giới hạn, ~14s riêng bảng này) + equipment_units/instances/
-- purchases/disposals/stock về Node rồi cộng dồn bằng JS
-- (computeEquipmentTypeReports trong equipment-reports.ts) — quét lại toàn
-- bộ lịch sử mỗi lần tải trang, chậm dần theo thời gian, và KHÔNG né được
-- cho vai trò quản lý (Giám đốc/Kế toán/Cửa hàng trưởng vẫn phải chờ đủ vì
-- họ mới là người cần xem báo cáo).
--
-- Chuyển toàn bộ phép cộng dồn này xuống Postgres — 1 RPC trả về ĐÚNG 1 dòng
-- mỗi loại hàng đã tính sẵn, thay vì hàng chục nghìn dòng thô. Cùng pattern
-- is_manage/effective_branch_id đã dùng ở customer_page_report/list
-- (20260805140000): Giám đốc/Admin/Kế toán truyền p_branch_id tuỳ ý (kể cả
-- null = toàn công ty, dùng ở /branches/[id] khi xem 1 chi nhánh cụ thể),
-- còn lại LUÔN ép về đúng branch_id của chính họ (dùng ở /equipment — trang
-- này không có ô chọn chi nhánh, mọi vai trò không quản lý chỉ thấy đúng
-- kho mình, khớp `stockBranchId` cũ trong equipment/page.tsx).
--
-- p_start/p_end (nullable, cả hai null = "Tất cả thời gian") CHỈ lọc phần
-- doanh thu/lượt thuê — tồn kho/giá trị tồn kho luôn là số liệu HIỆN TẠI,
-- không phụ thuộc kỳ đang xem (khớp đúng hành vi cũ: currentStockQty/
-- currentInventoryValue trong computeEquipmentTypeReports không hề đụng tới
-- orderLines).
--
-- Giữ nguyên các quyết định số liệu đã có trong bản JS cũ (không "sửa" gì
-- thêm ở đây, chỉ chuyển chỗ tính toán):
--   - Giá vốn bình quân gia quyền = tổng(quantity*unit_cost)/tổng(quantity)
--     theo equipment_purchases của từng equipment_unit (KHÔNG lọc chi nhánh
--     — equipment_purchases/equipment_disposals vốn dĩ chưa từng bị lọc
--     branch trong bản JS cũ, giữ nguyên).
--   - equipment_stock/equipment_instances CÓ lọc theo branch_id.
--   - equipment_instances chỉ cộng vào tồn kho/giá vốn khi
--     tracking_type='individual' của type đó — vài loại hàng cũ bị đổi
--     tracking_type sang 'quantity' mà chưa dọn hết instance mồ côi, bỏ qua
--     để không cộng đè (xem migration 20260728000000).
-- ---------------------------------------------------------------------

create or replace function public.equipment_page_report(
  p_branch_id uuid default null,
  p_start date default null,
  p_end date default null
)
returns table (
  equipment_type_id uuid,
  revenue numeric,
  rental_count int,
  current_stock_qty numeric,
  current_inventory_value numeric,
  purchase_cost numeric,
  disposal_proceeds numeric,
  profit numeric,
  profit_ratio numeric
)
language sql
stable
security definer
set search_path = public
as $$
with caller as (
  select role, branch_id from public.employees where user_id = auth.uid() and is_active
),
is_manage as (
  select coalesce((select role from caller) in ('giam_doc', 'admin', 'ke_toan'), false) as v
),
effective as (
  select case when (select v from is_manage) then p_branch_id else (select branch_id from caller) end as branch_id
),
unit_cost as (
  select equipment_unit_id,
         sum(quantity * unit_cost) / nullif(sum(quantity), 0) as avg_cost,
         sum(quantity * unit_cost) as purchase_cost
  from public.equipment_purchases
  group by equipment_unit_id
),
unit_disposal as (
  select equipment_unit_id, sum(quantity * unit_price) as disposal_proceeds
  from public.equipment_disposals
  group by equipment_unit_id
),
unit_stock as (
  select equipment_unit_id, sum(quantity_total) as qty
  from public.equipment_stock
  where (select branch_id from effective) is null or branch_id = (select branch_id from effective)
  group by equipment_unit_id
),
unit_agg as (
  select
    u.equipment_type_id,
    coalesce(sum(uc.purchase_cost), 0) as purchase_cost,
    coalesce(sum(ud.disposal_proceeds), 0) as disposal_proceeds,
    coalesce(sum(us.qty), 0) as qty,
    coalesce(sum(us.qty * coalesce(uc.avg_cost, 0)), 0) as inventory_value
  from public.equipment_units u
  left join unit_cost uc on uc.equipment_unit_id = u.id
  left join unit_disposal ud on ud.equipment_unit_id = u.id
  left join unit_stock us on us.equipment_unit_id = u.id
  group by u.equipment_type_id
),
instance_agg as (
  select
    i.equipment_type_id,
    coalesce(sum(i.purchase_price), 0) as purchase_cost,
    coalesce(sum(case when i.status = 'disposed' then i.disposal_price else 0 end), 0) as disposal_proceeds,
    count(*) filter (where i.status <> 'disposed') as qty,
    coalesce(sum(case when i.status <> 'disposed' then i.purchase_price else 0 end), 0) as inventory_value
  from public.equipment_instances i
  join public.equipment_types t on t.id = i.equipment_type_id and t.tracking_type = 'individual'
  where (select branch_id from effective) is null or i.branch_id = (select branch_id from effective)
  group by i.equipment_type_id
),
scoped_orders as (
  select id from public.orders
  where cancelled_at is null
    and (p_start is null or order_date >= p_start)
    and (p_end is null or order_date <= p_end)
    and (
      (select branch_id from effective) is null
      or pickup_branch_id = (select branch_id from effective)
      or return_branch_id = (select branch_id from effective)
    )
),
revenue_agg as (
  select oe.equipment_type_id, sum(oe.line_total) as revenue, count(*) as rental_count
  from public.order_equipment oe
  where oe.equipment_type_id is not null
    and oe.order_id in (select id from scoped_orders)
  group by oe.equipment_type_id
)
select
  t.id as equipment_type_id,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.rental_count, 0)::int as rental_count,
  coalesce(ua.qty, 0) + coalesce(ia.qty, 0) as current_stock_qty,
  coalesce(ua.inventory_value, 0) + coalesce(ia.inventory_value, 0) as current_inventory_value,
  coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0) as purchase_cost,
  coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0) as disposal_proceeds,
  coalesce(r.revenue, 0) + coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0)
    - (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0)) as profit,
  case
    when (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0)) > 0
    then (coalesce(r.revenue, 0) + coalesce(ua.disposal_proceeds, 0) + coalesce(ia.disposal_proceeds, 0))
         / (coalesce(ua.purchase_cost, 0) + coalesce(ia.purchase_cost, 0))
    else null
  end as profit_ratio
from public.equipment_types t
left join unit_agg ua on ua.equipment_type_id = t.id
left join instance_agg ia on ia.equipment_type_id = t.id
left join revenue_agg r on r.equipment_type_id = t.id;
$$;

revoke all on function public.equipment_page_report(uuid, date, date) from anon;
