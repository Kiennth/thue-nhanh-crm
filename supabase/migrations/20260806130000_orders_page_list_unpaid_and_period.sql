-- ---------------------------------------------------------------------
-- CEO yêu cầu 2026-08-06: Kế toán (như Giám đốc) cần thấy tổng quan đơn
-- hàng theo THÁNG NÀY/THÁNG TRƯỚC/NĂM NAY/NĂM TRƯỚC (không phải số dồn
-- "Tất cả thời gian" như hiện tại — "các con số này không có giá trị gì
-- cả"), và cần thấy đơn hàng CÒN CHƯA THANH TOÁN HẾT.
--
-- Mở rộng orders_page_list (20260806120000):
--   1. Thêm p_unpaid_only — lọc "base" chỉ còn đơn chưa huỷ và còn thiếu
--      tiền (remaining > 0), dùng khi bấm vào thẻ "Chưa thanh toán hết" để
--      xem thẳng danh sách.
--   2. Thêm unpaidCount/unpaidAmount vào "stats" — LUÔN tính trên toàn bộ
--      "base" (bất kể p_unpaid_only đang bật hay tắt), để khối tổng quan
--      (gọi RPC lần riêng, không phụ thuộc bộ lọc của bảng danh sách bên
--      dưới) vẫn biết được số đơn chưa thanh toán trong kỳ đang xem.
--   3. remaining = còn thiếu của TỪNG đơn = giá đã gồm VAT trừ tổng đã
--      thanh toán cho đúng đơn đó, không âm — cùng công thức đã dùng ở
--      customer_page_report (20260806110000), đơn đã huỷ không tính.
-- ---------------------------------------------------------------------

-- Thêm p_unpaid_only làm THAY ĐỔI danh sách kiểu tham số (9 -> 10) so với
-- 20260806120000 — CREATE OR REPLACE không tự thay thế được overload cũ
-- (Postgres phân biệt hàm theo đúng danh sách KIỂU tham số), phải DROP
-- tường minh trước để tránh tồn tại 2 overload gây nhập nhằng khi
-- PostgREST/Supabase JS gọi theo tên tham số.
drop function if exists public.orders_page_list(
  uuid, text, date, date, text, text, text, int, int
);

create or replace function public.orders_page_list(
  p_branch_id uuid default null,
  p_status text default 'all',
  p_range_start date default null,
  p_range_end date default null,
  p_search text default null,
  p_sort text default null,
  p_dir text default 'asc',
  p_page int default 1,
  p_page_size int default 20,
  p_unpaid_only boolean default false
)
returns jsonb
language sql
stable
set search_path = public
as $$
with paid as (
  select order_id, sum(amount) as amt from public.order_payments group by 1
),
base as (
  select
    o.id, o.order_code, o.pickup_branch_id, o.return_branch_id, o.customer_id,
    o.rental_start_at, o.rental_end_at, o.total_value, o.status, o.order_date,
    o.completed_at, o.cancelled_at,
    c.name as customer_name,
    greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) as remaining,
    case
      when o.cancelled_at is not null then 4
      when o.completed_at is not null then 6
      else (case o.status
        when 'bao_gia' then 1
        when 'chot_don' then 2
        when 'chuan_bi' then 3
        when 'giao_hang_ban_giao' then 5
        when 'ky_hop_dong_thu_coc' then 7
        when 'nghiem_thu' then 8
        when 'nhap_kho_bao_tri' then 9
        when 'thu_hoi' then 10
        when 'tiep_nhan_yeu_cau' then 11
        when 'van_hanh_xu_ly_su_co' then 12
      end)
    end as status_rank
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  left join paid p on p.order_id = o.id
  where
    (p_branch_id is null or o.pickup_branch_id = p_branch_id or o.return_branch_id = p_branch_id)
    and (
      p_status is null or p_status = 'all'
      or (p_status = 'completed' and o.completed_at is not null)
      or (p_status = 'cancelled' and o.cancelled_at is not null)
      or (p_status = o.status::text and o.completed_at is null and o.cancelled_at is null)
      or p_status not in (
        'completed', 'cancelled', 'tiep_nhan_yeu_cau', 'bao_gia', 'chot_don',
        'ky_hop_dong_thu_coc', 'chuan_bi', 'giao_hang_ban_giao',
        'van_hanh_xu_ly_su_co', 'thu_hoi', 'nghiem_thu', 'nhap_kho_bao_tri'
      )
    )
    and (p_range_start is null or o.order_date >= p_range_start)
    and (p_range_end is null or o.order_date <= p_range_end)
    and (
      p_search is null or p_search = ''
      or o.order_code ilike '%' || p_search || '%'
      or c.name ilike '%' || p_search || '%'
    )
    and (
      not p_unpaid_only
      or (o.cancelled_at is null
          and greatest(0, round(o.total_value * 1.08 * 100) / 100 - coalesce(p.amt, 0)) > 0)
    )
),
sorted as (
  select * from base
  order by
    case when p_sort = 'rental_start_at' and p_dir = 'asc' then rental_start_at end asc nulls first,
    case when p_sort = 'rental_start_at' and p_dir = 'desc' then rental_start_at end desc nulls last,
    case when p_sort = 'rental_end_at' and p_dir = 'asc' then rental_end_at end asc nulls first,
    case when p_sort = 'rental_end_at' and p_dir = 'desc' then rental_end_at end desc nulls last,
    case when p_sort = 'customer' and p_dir = 'asc' then customer_name end asc,
    case when p_sort = 'customer' and p_dir = 'desc' then customer_name end desc,
    case when p_sort = 'total_value' and p_dir = 'asc' then total_value end asc,
    case when p_sort = 'total_value' and p_dir = 'desc' then total_value end desc,
    case when p_sort = 'status' and p_dir = 'asc' then status_rank end asc,
    case when p_sort = 'status' and p_dir = 'desc' then status_rank end desc,
    case when p_sort is null
      or p_sort not in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then order_date end desc,
    case when p_sort is null
      or p_sort not in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then id end desc,
    case when p_sort is not null
      and p_sort in ('rental_start_at', 'rental_end_at', 'customer', 'total_value', 'status')
      then id end asc
)
select jsonb_build_object(
  'totalCount', (select count(*) from base),
  'stats', (
    select jsonb_build_object(
      'totalRevenue', coalesce(sum(total_value), 0),
      'completedCount', count(*) filter (where cancelled_at is null and completed_at is not null),
      'cancelledCount', count(*) filter (where cancelled_at is not null),
      'unpaidCount', count(*) filter (where cancelled_at is null and remaining > 0),
      'unpaidAmount', coalesce(sum(remaining) filter (where cancelled_at is null and remaining > 0), 0)
    ) from base
  ),
  'rows', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select id, order_code, pickup_branch_id, return_branch_id, customer_id, customer_name,
             rental_start_at, rental_end_at, total_value, status, order_date, completed_at, cancelled_at
      from sorted
      limit greatest(p_page_size, 1)
      offset greatest(p_page - 1, 0) * greatest(p_page_size, 1)
    ) t
  )
);
$$;

revoke all on function public.orders_page_list(uuid, text, date, date, text, text, text, int, int, boolean) from anon;
