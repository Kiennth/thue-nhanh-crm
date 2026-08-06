-- ---------------------------------------------------------------------
-- /orders (trang dùng nhiều nhất hệ thống) kéo TOÀN BỘ đơn khớp bộ lọc
-- (mặc định "Tất cả thời gian" — có thể chạm ~10.000+ dòng) + TOÀN BỘ bảng
-- customers (~5.500+ dòng, khi tìm kiếm hoặc sắp theo tên khách) về Node rồi
-- lọc/sắp/phân trang/tính thẻ tổng kết bằng JS mỗi lần tải trang — CEO phản
-- ánh 2026-08-06 "load chậm lắm" cho Admin, đúng nguyên nhân.
--
-- Chuyển filter + tìm kiếm (join customers ngay trong SQL thay vì kéo
-- nguyên bảng) + sắp xếp + phân trang + tính thẻ tổng kết xuống Postgres —
-- chỉ trả về đúng 1 trang (≤20 dòng) + vài con số tổng, thay vì hàng chục
-- nghìn dòng thô.
--
-- RLS orders/customers hiện đã mở SELECT cho MỌI nhân viên (không phân biệt
-- chi nhánh — xem 20260805120000, customers_all_employees) nên hàm này
-- KHÔNG cần security definer/is_manage như customer_page_report — chỉ cần
-- security invoker (mặc định) là đủ, phạm vi chi nhánh vẫn do trang gọi
-- (p_branch_id) quyết định giống hệt code cũ (branchId truyền từ
-- orders/page.tsx tuỳ vai trò), không phải RLS chặn.
--
-- Bonus: trả kèm customer_name qua join sẵn — client không cần fetch riêng
-- bảng customers nữa (needAllCustomers cũ) trong MỌI trường hợp, không chỉ
-- khi có tìm kiếm/sắp theo tên.
-- ---------------------------------------------------------------------

create or replace function public.orders_page_list(
  p_branch_id uuid default null,
  p_status text default 'all',
  p_range_start date default null,
  p_range_end date default null,
  p_search text default null,
  p_sort text default null,
  p_dir text default 'asc',
  p_page int default 1,
  p_page_size int default 20
)
returns jsonb
language sql
stable
set search_path = public
as $$
with base as (
  select
    o.id, o.order_code, o.pickup_branch_id, o.return_branch_id, o.customer_id,
    o.rental_start_at, o.rental_end_at, o.total_value, o.status, o.order_date,
    o.completed_at, o.cancelled_at,
    c.name as customer_name,
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
  where
    (p_branch_id is null or o.pickup_branch_id = p_branch_id or o.return_branch_id = p_branch_id)
    and (
      p_status is null or p_status = 'all'
      or (p_status = 'completed' and o.completed_at is not null)
      or (p_status = 'cancelled' and o.cancelled_at is not null)
      or (p_status = o.status::text and o.completed_at is null and o.cancelled_at is null)
      -- Giá trị lạ (không khớp bất kỳ nhánh nào ở trên) = không lọc, khớp
      -- hành vi cũ (ordersQueryWithFilters bỏ qua mọi if/else-if không khớp).
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
    -- Mặc định (không chọn cột sắp) = order_date desc, id desc (đơn mới
    -- nhất trước). Có chọn cột sắp = tie-break bằng id asc, khớp hành vi
    -- Array.sort ỔN ĐỊNH của JS trên tập đã fetch theo .order("id") asc.
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
      'cancelledCount', count(*) filter (where cancelled_at is not null)
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

revoke all on function public.orders_page_list(uuid, text, date, date, text, text, text, int, int) from anon;
