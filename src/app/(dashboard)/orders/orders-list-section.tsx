import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { SearchInput } from "@/components/search-input";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { CustomerAvatar } from "@/components/customer-avatar";
import { BranchBadge } from "@/components/branch-badge";
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { deleteOrder } from "@/lib/actions/orders";
import { vnNow } from "@/lib/vn-time";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import type { TaskType } from "@/types/database";
import { OrderDialog } from "./order-dialog";
import { OrderStatusFilter } from "./order-status-filter";
import { OrderDateRangeFilter } from "./order-date-range-filter";
import { OrderBranchScopeFilter } from "./order-branch-scope-filter";
import { VN_TIME_ZONE } from "@/lib/date-format";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});
const PAGE_SIZE = 20;

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

const ORDER_SORT_KEYS = ["rental_start_at", "rental_end_at", "customer", "total_value", "status"] as const;
type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];
function isOrderSortKey(value: string): value is OrderSortKey {
  return (ORDER_SORT_KEYS as readonly string[]).includes(value);
}

// 1 dòng đã lọc/sắp/phân trang sẵn từ RPC orders_page_list (migration
// 20260806120000) — kèm sẵn customer_name qua join, không cần fetch riêng
// bảng customers nữa (needAllCustomers cũ).
interface OrderRow {
  id: string;
  order_code: string;
  pickup_branch_id: string;
  return_branch_id: string;
  customer_id: string;
  customer_name: string | null;
  rental_start_at: string | null;
  rental_end_at: string | null;
  total_value: number;
  status: TaskType;
  order_date: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface OrdersPageListResult {
  totalCount: number;
  stats: { totalRevenue: number; completedCount: number; cancelledCount: number };
  rows: OrderRow[];
}

// Nội dung trang /orders — Admin/Kế toán thấy tất cả chi nhánh (branchId
// null), các role khác chỉ thấy đơn liên quan tới chi nhánh mình.
export async function OrdersListSection({
  status,
  range,
  from,
  to,
  page,
  sort,
  dir,
  search,
  branchId,
  canDelete,
  showStats = true,
  branchScope,
}: {
  status?: string;
  range?: string;
  from?: string;
  to?: string;
  page?: string;
  sort?: string;
  dir?: string;
  search?: string;
  branchId: string | null;
  canDelete: boolean;
  // Kỹ thuật/Sales không được xem số liệu tổng hợp — ẩn cả dãy thẻ thống kê
  // (đếm đơn + tổng doanh số); việc hằng ngày của họ chỉ cần bảng danh sách.
  showStats?: boolean;
  // Chỉ Cửa hàng trưởng có: chọn xem đơn kho mình (mặc định) hay toàn hệ
  // thống. Vắng mặt thì không hiện ô chọn — phạm vi do role quyết định cứng.
  branchScope?: { value: "branch" | "all"; branchName: string };
}) {
  const activeStatus = status ?? "all";
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "all";
  const dateRange = computeDateRange(activeRange, vnNow(), { from, to });
  const activeSort: OrderSortKey | null = sort && isOrderSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(page) || 1);

  const supabase = await createClient();

  // Lọc (chi nhánh/trạng thái/khoảng ngày) + tìm kiếm (join customers ngay
  // trong SQL) + sắp xếp + phân trang + thẻ tổng kết đều tính trong Postgres
  // qua RPC orders_page_list (migration 20260806120000) — thay cho việc kéo
  // TOÀN BỘ đơn khớp bộ lọc (~10.000 dòng) + TOÀN BỘ bảng customers (~5.500
  // dòng, khi tìm kiếm/sắp theo tên) về JS mỗi lần tải trang. Kèm sẵn
  // customer_name qua join nên không cần fetch riêng bảng customers nữa.
  const [rpcRes, { data: branches }] = await Promise.all([
    supabase.rpc("orders_page_list", {
      p_branch_id: branchId,
      p_status: activeStatus,
      p_range_start: dateRange?.start ?? null,
      p_range_end: dateRange?.end ?? null,
      p_search: activeSearch || null,
      p_sort: activeSort,
      p_dir: activeDir,
      p_page: requestedPage,
      p_page_size: PAGE_SIZE,
    }),
    supabase.from("branches").select("id, name").order("position"),
  ]);

  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));

  let result = (rpcRes.data ?? { totalCount: 0, stats: { totalRevenue: 0, completedCount: 0, cancelledCount: 0 }, rows: [] }) as OrdersPageListResult;
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
  let currentPage = requestedPage;
  // Trang đang xin vượt quá số trang thật (VD: đổi bộ lọc làm tổng số đơn
  // giảm xuống) — gọi lại đúng trang cuối, khớp hành vi clamp cũ.
  if (requestedPage > totalPages) {
    currentPage = totalPages;
    const { data: refetched } = await supabase.rpc("orders_page_list", {
      p_branch_id: branchId,
      p_status: activeStatus,
      p_range_start: dateRange?.start ?? null,
      p_range_end: dateRange?.end ?? null,
      p_search: activeSearch || null,
      p_sort: activeSort,
      p_dir: activeDir,
      p_page: currentPage,
      p_page_size: PAGE_SIZE,
    });
    if (refetched) result = refetched as OrdersPageListResult;
  }

  const totalCount = result.totalCount;
  const totalRevenue = result.stats.totalRevenue;
  const completedCount = result.stats.completedCount;
  const cancelledCount = result.stats.cancelledCount;
  const processingCount = totalCount - completedCount - cancelledCount;
  const orders = result.rows;
  const customerNameById = new Map(orders.map((o) => [o.customer_id, o.customer_name ?? "—"]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Đơn hàng</h2>
        <OrderDialog branches={branchList} />
      </div>

      {showStats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Tổng đơn (khớp bộ lọc)" value={totalCount} />
          <StatCard label="Đang xử lý" value={processingCount} />
          <StatCard label="Hoàn tất" value={completedCount} />
          <StatCard label="Đã huỷ" value={cancelledCount} />
          <StatCard
            label="Tổng doanh số"
            value={`${currencyFormatter.format(Math.round(totalRevenue))}đ`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm theo mã đơn, tên khách hàng..."
          value={activeSearch}
          resetParams={["page"]}
        />
        <OrderStatusFilter value={activeStatus} />
        <OrderDateRangeFilter preset={activeRange} from={from ?? ""} to={to ?? ""} />
        {branchScope && (
          <OrderBranchScopeFilter value={branchScope.value} branchName={branchScope.branchName} />
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Mã đơn</TableHead>
            <TableHead className="w-28">Chi nhánh</TableHead>
            <SortableTableHead sortKey="customer" label="Khách hàng" />
            <SortableTableHead sortKey="rental_start_at" label="Ngày bắt đầu" />
            <SortableTableHead sortKey="rental_end_at" label="Ngày kết thúc" />
            <SortableTableHead sortKey="total_value" label="Doanh số" />
            <SortableTableHead sortKey="status" label="Trạng thái" />
            {canDelete && <TableHead className="w-16"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <ClickableTableRow key={order.id} href={`/orders/${order.id}`}>
              <TableCell className="max-w-28 truncate font-medium">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.order_code}
                </Link>
              </TableCell>
              <TableCell className="max-w-28 truncate">
                <div className="flex items-center gap-1">
                  <BranchBadge name={branchNameById.get(order.pickup_branch_id) ?? "—"} />
                  {order.return_branch_id !== order.pickup_branch_id && (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <BranchBadge name={branchNameById.get(order.return_branch_id) ?? "—"} />
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <CustomerAvatar id={order.customer_id} name={customerNameById.get(order.customer_id) ?? "—"} />
                  {customerNameById.get(order.customer_id) ?? "—"}
                </div>
              </TableCell>
              <TableCell>
                {order.rental_start_at ? dateTimeFormatter.format(new Date(order.rental_start_at)) : "—"}
              </TableCell>
              <TableCell>
                {order.rental_end_at ? dateTimeFormatter.format(new Date(order.rental_end_at)) : "—"}
              </TableCell>
              <TableCell>{currencyFormatter.format(order.total_value)}đ</TableCell>
              <TableCell>
                {order.cancelled_at ? (
                  <Badge variant="destructive">Đã huỷ</Badge>
                ) : order.completed_at ? (
                  <Badge>Hoàn tất</Badge>
                ) : (
                  <Badge variant="outline">{TASK_TYPE_LABELS[order.status]}</Badge>
                )}
              </TableCell>
              {canDelete && (
                <TableCell>
                  <ConfirmDeleteButton
                    confirmMessage={`Xoá đơn hàng "${order.order_code}"? Hành động này không thể hoàn tác.`}
                    successMessage="Đã xoá đơn hàng."
                    action={deleteOrder}
                    actionArg={order.id}
                  />
                </TableCell>
              )}
            </ClickableTableRow>
          ))}
          {!orders.length && (
            <TableRow>
              <TableCell colSpan={canDelete ? 8 : 7} className="text-center text-muted-foreground">
                Không có đơn hàng nào khớp bộ lọc.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PaginationControls
        page={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        itemLabel="đơn hàng"
      />
    </div>
  );
}
