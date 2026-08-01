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
import { fetchAllRowsFast } from "@/lib/supabase/fetch-all";
import { deleteOrder } from "@/lib/actions/orders";
import { vnNow } from "@/lib/vn-time";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRange,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import type { TaskType } from "@/types/database";
import { OrderDialog } from "./order-dialog";
import { OrderStatusFilter } from "./order-status-filter";
import { OrderDateRangeFilter } from "./order-date-range-filter";
import { OrderBranchScopeFilter } from "./order-branch-scope-filter";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const PAGE_SIZE = 20;

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPE_SEQUENCE as readonly string[]).includes(value);
}

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

const ORDER_SORT_KEYS = ["rental_start_at", "rental_end_at", "customer", "total_value", "status"] as const;
type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];
function isOrderSortKey(value: string): value is OrderSortKey {
  return (ORDER_SORT_KEYS as readonly string[]).includes(value);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface OrderFilters {
  branchId: string | null;
  activeStatus: string;
  dateRange: DateRange | null;
}

interface OrderRow {
  id: string;
  order_code: string;
  pickup_branch_id: string;
  return_branch_id: string;
  customer_id: string;
  rental_start_at: string | null;
  rental_end_at: string | null;
  total_value: number;
  status: TaskType;
  order_date: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

// Áp cùng 1 bộ lọc (chi nhánh/trạng thái/khoảng ngày) cho câu truy vấn TOÀN
// BỘ đơn khớp bộ lọc — dùng chung cho cả thẻ tổng kết lẫn bảng danh sách.
function ordersQueryWithFilters<Q extends string>(
  supabase: SupabaseServerClient,
  selectColumns: Q,
  { branchId, activeStatus, dateRange }: OrderFilters,
  options?: { count: "exact"; head: boolean },
) {
  let q = supabase.from("orders").select(selectColumns, options);
  if (branchId) {
    q = q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
  }
  if (activeStatus === "completed") {
    q = q.not("completed_at", "is", null);
  } else if (activeStatus === "cancelled") {
    q = q.not("cancelled_at", "is", null);
  } else if (isTaskType(activeStatus)) {
    q = q.eq("status", activeStatus).is("completed_at", null).is("cancelled_at", null);
  }
  if (dateRange) {
    q = q.gte("order_date", dateRange.start).lte("order_date", dateRange.end);
  }
  return q;
}

function statusLabel(order: Pick<OrderRow, "status" | "completed_at" | "cancelled_at">): string {
  if (order.cancelled_at) return "Đã huỷ";
  if (order.completed_at) return "Hoàn tất";
  return TASK_TYPE_LABELS[order.status];
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
  const filters: OrderFilters = { branchId, activeStatus, dateRange };
  const activeSort: OrderSortKey | null = sort && isOrderSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const activeSearch = search?.trim() ?? "";

  const supabase = await createClient();

  // Sắp xếp theo Khách hàng/Doanh số/Trạng thái không thể đẩy hết xuống
  // Postgres (tên khách phải join qua bảng customers, trạng thái là suy ra
  // từ 3 cột) — lấy TOÀN BỘ đơn khớp bộ lọc (đằng nào cũng cần đủ để tính
  // thẻ tổng kết phía trên), lọc/sắp/phân trang gộp 1 lần trong JS. ~10.000
  // dòng nên phân trang SONG SONG — bản tuần tự là một nửa nguyên nhân
  // /orders sập 503 trên Cloudflare cho vai Giám đốc.
  //
  // Bảng customers chỉ cần NGUYÊN bảng khi phải khớp/sắp theo tên khách trên
  // toàn bộ đơn (đang tìm kiếm, hoặc sắp theo cột Khách hàng) — còn mặc định
  // chỉ cần tên của ≤20 khách đang hiện, nạp sau khi đã cắt trang.
  const needAllCustomers = activeSearch !== "" || activeSort === "customer";
  const [allOrders, { data: branches }, allCustomers] = await Promise.all([
    fetchAllRowsFast<OrderRow>(
      (rangeFrom, rangeTo) =>
        ordersQueryWithFilters(
          supabase,
          "id, order_code, pickup_branch_id, return_branch_id, customer_id, rental_start_at, rental_end_at, total_value, status, order_date, completed_at, cancelled_at",
          filters,
        )
          .order("id")
          .range(rangeFrom, rangeTo),
      () => ordersQueryWithFilters(supabase, "*", filters, { count: "exact", head: true }),
    ),
    supabase.from("branches").select("id, name").order("name"),
    needAllCustomers
      ? fetchAllRowsFast<{ id: string; name: string }>(
          (rangeFrom, rangeTo) =>
            supabase.from("customers").select("id, name").order("id").range(rangeFrom, rangeTo),
          () => supabase.from("customers").select("*", { count: "exact", head: true }),
        )
      : Promise.resolve(null),
  ]);

  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const customerNameById = new Map((allCustomers ?? []).map((c) => [c.id, c.name]));

  // Tìm theo mã đơn hoặc tên khách hàng — lọc trên tập đã khớp
  // chi nhánh/trạng thái/khoảng ngày, áp trước khi tính thẻ tổng kết để các
  // con số phía trên cũng phản ánh đúng kết quả tìm kiếm.
  const searchLower = activeSearch.toLowerCase();
  const searchedOrders = activeSearch
    ? allOrders.filter(
        (o) =>
          o.order_code.toLowerCase().includes(searchLower) ||
          (customerNameById.get(o.customer_id) ?? "").toLowerCase().includes(searchLower),
      )
    : allOrders;

  const totalCount = searchedOrders.length;
  let totalRevenue = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  for (const o of searchedOrders) {
    totalRevenue += o.total_value;
    if (o.cancelled_at) cancelledCount += 1;
    else if (o.completed_at) completedCount += 1;
  }
  const processingCount = totalCount - completedCount - cancelledCount;

  const dirMult = activeDir === "asc" ? 1 : -1;
  const sortedOrders = [...searchedOrders].sort((a, b) => {
    switch (activeSort) {
      case "rental_start_at":
        return dirMult * (a.rental_start_at ?? "").localeCompare(b.rental_start_at ?? "");
      case "rental_end_at":
        return dirMult * (a.rental_end_at ?? "").localeCompare(b.rental_end_at ?? "");
      case "customer":
        return (
          dirMult *
          (customerNameById.get(a.customer_id) ?? "").localeCompare(
            customerNameById.get(b.customer_id) ?? "",
            "vi",
          )
        );
      case "total_value":
        return dirMult * (a.total_value - b.total_value);
      case "status":
        return dirMult * statusLabel(a).localeCompare(statusLabel(b), "vi");
      default:
        // .order("id") thứ 2 làm tie-breaker — nhiều đơn cùng order_date,
        // nếu chỉ sort theo order_date thì thứ tự giữa các trang không ổn
        // định, gây trùng hoặc bỏ sót dòng khi chuyển trang.
        return b.order_date.localeCompare(a.order_date) || b.id.localeCompare(a.id);
    }
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const orders = sortedOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!needAllCustomers && orders.length) {
    const pageCustomerIds = [...new Set(orders.map((o) => o.customer_id))];
    const { data: pageCustomers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", pageCustomerIds);
    for (const c of pageCustomers ?? []) customerNameById.set(c.id, c.name);
  }

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
