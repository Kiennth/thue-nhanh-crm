import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { ORDER_FLOW_LABELS, orderFlowStage } from "@/lib/order-labels";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import type { TaskType } from "@/types/database";
import { QuickOrderDialog } from "./quick-order-dialog";
import { BarChart3, ChevronDown } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SaveViewButton, DeleteSavedViewButton } from "./saved-view-controls";
import { OrderStatusFilter } from "./order-status-filter";
import { OrderDateRangeFilter } from "./order-date-range-filter";
import { OrderBranchScopeFilter } from "./order-branch-scope-filter";
import { OrdersBranchToggle } from "./orders-branch-toggle";
import {
  OrdersOverviewPeriodToggle,
  type OrdersOverviewPeriod,
} from "./orders-overview-period-toggle";
import { OrdersStatusDonutChart } from "./orders-status-donut-chart";
import { OrdersCollectionProgress } from "./orders-collection-progress";
import { VN_TIME_ZONE } from "@/lib/date-format";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});
const PAGE_SIZE = 25;
// View lưu sẵn (Grok tách gọn CRM 10/10 giai đoạn 2) thay 12 nút trạng thái —
// 12 trạng thái vẫn còn trong "Bộ lọc nâng cao". Đơn web mới là 1 tab dẫn sang
// /orders/web (số đơn web chỉ hiện 1 lần ở đây).
const SYSTEM_VIEWS = [
  { key: "processing", label: "Đang xử lý" },
  { key: "deliver_soon", label: "Giao hôm nay & mai" },
  { key: "return_soon", label: "Thu hồi hôm nay & mai" },
  { key: "overdue", label: "Quá hạn trả", alert: true },
  { key: "owing", label: "Còn nợ" },
  { key: "invoice_pending", label: "Chờ xuất HĐ" },
  { key: "completed", label: "Hoàn tất" },
  { key: "all", label: "Tất cả" },
] as const;
// Link cũ (Trang chủ / Hôm nay trước 10/10) vẫn mở được.
const LEGACY_VIEWS = ["deliver_today", "return_today"];
type ViewCounts = Record<string, number>;

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
  delivered_at: string | null;
  paid_amount: number;
  remaining: number;
  owner_name: string | null;
  no_serial: boolean;
  no_driver: boolean;
  invoice_pending: boolean;
  // Lý do chốt khâu dù còn nợ / chưa thu cọc (bảng step_overrides).
  override_reason?: string | null;
}

interface OrdersPageListStats {
  // Doanh số = đơn ĐÃ GIAO HÀNG, GỒM VAT (CEO 2026-09-02) — cùng nền với
  // vatRevenue nên khớp thanh "Tiến độ thu tiền" khi cả kỳ đã giao hết.
  totalRevenue: number;
  // Tổng giá trị ĐÃ GỒM VAT của mọi đơn chưa huỷ (kể cả chưa giao).
  vatRevenue: number;
  // Còn thiếu của RIÊNG đơn đã giao — thanh "Tiến độ thu tiền" dùng cặp
  // (totalRevenue, deliveredUnpaidAmount) nên Đã thu + Còn thiếu luôn cộng
  // đúng bằng Tổng doanh số (CEO 2026-09-02). Nợ đơn đặt trước chưa giao
  // vẫn nằm đủ ở unpaidCount/unpaidAmount (thẻ "Chưa thanh toán hết").
  deliveredUnpaidAmount: number;
  completedCount: number;
  cancelledCount: number;
  unpaidCount: number;
  unpaidAmount: number;
}

interface OrdersPageListResult {
  totalCount: number;
  stats: OrdersPageListStats;
  rows: OrderRow[];
}

const EMPTY_STATS: OrdersPageListStats = {
  totalRevenue: 0,
  vatRevenue: 0,
  deliveredUnpaidAmount: 0,
  completedCount: 0,
  cancelledCount: 0,
  unpaidCount: 0,
  unpaidAmount: 0,
};

function isOverviewPeriod(value: string): value is OrdersOverviewPeriod {
  return ["this_month", "last_month", "this_year", "last_year"].includes(value);
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
  overview,
  paid,
  view,
  charts,
  savedViews = [],
  branchId,
  canDelete,
  showStats = true,
  branchScope,
  branchToggle,
}: {
  status?: string;
  range?: string;
  from?: string;
  to?: string;
  page?: string;
  sort?: string;
  dir?: string;
  search?: string;
  // Kỳ cho khối "Tổng quan đơn hàng" — độc lập với `range` của bảng bên
  // dưới (xem OrdersOverviewPeriodToggle).
  overview?: string;
  // "unpaid" = đang lọc bảng chỉ còn đơn chưa thanh toán hết (bấm từ thẻ
  // "Chưa thanh toán hết" trong khối tổng quan).
  paid?: string;
  // View lưu sẵn (SYSTEM_VIEWS) — trống = Đang xử lý (hoặc Tất cả khi đang
  // tìm / lọc trạng thái).
  view?: string;
  // "1" = mở khối biểu đồ (mặc định gập để bảng lên đầu trang).
  charts?: string;
  // View riêng của người đang xem (bảng saved_views).
  savedViews?: { id: string; name: string; query: string }[];
  branchId: string | null;
  canDelete: boolean;
  // Kỹ thuật/Sales không được xem số liệu tổng hợp — ẩn cả dãy thẻ thống kê
  // (đếm đơn + tổng doanh số); việc hằng ngày của họ chỉ cần bảng danh sách.
  showStats?: boolean;
  // Chỉ Cửa hàng trưởng có: chọn xem đơn kho mình (mặc định) hay toàn hệ
  // thống. Vắng mặt thì không hiện ô chọn — phạm vi do role quyết định cứng.
  branchScope?: { value: "branch" | "all"; branchName: string };
  // Chỉ Giám đốc/Admin/Kế toán có: toggle xem theo 1 kho (CEO 2026-08-13).
  // selectedId đã hoà vào branchId ở page.tsx nên cả tổng quan lẫn bảng đều
  // theo kho đang chọn; ở đây chỉ cần vẽ toggle + giữ lựa chọn qua các link.
  branchToggle?: { selectedId: string | null };
}) {
  const activeStatus = status ?? "all";
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "all";
  const dateRange = computeDateRange(activeRange, vnNow(), { from, to });
  const activeSort: OrderSortKey | null = sort && isOrderSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(page) || 1);
  const unpaidOnly = paid === "unpaid";
  const explicitView =
    view && (SYSTEM_VIEWS.some((v) => v.key === view) || LEGACY_VIEWS.includes(view)) ? view : null;
  // Đang tìm hoặc lọc trạng thái mà không chọn view → tìm trong Tất cả.
  const activeView = explicitView ?? (activeSearch || status || unpaidOnly ? "all" : "processing");
  const showCharts = charts === "1";
  const overviewPeriod: OrdersOverviewPeriod =
    overview && isOverviewPeriod(overview) ? overview : "this_month";
  const overviewDateRange = computeDateRange(overviewPeriod, vnNow());

  const supabase = await createClient();

  // Lọc (chi nhánh/trạng thái/khoảng ngày/chưa thanh toán) + tìm kiếm (join
  // customers ngay trong SQL) + sắp xếp + phân trang + thẻ tổng kết đều tính
  // trong Postgres qua RPC orders_page_list (migration 20260806120000, mở
  // rộng p_unpaid_only ở 20260806130000) — thay cho việc kéo TOÀN BỘ đơn
  // khớp bộ lọc (~10.000 dòng) + TOÀN BỘ bảng customers (~5.500 dòng, khi
  // tìm kiếm/sắp theo tên) về JS mỗi lần tải trang. Kèm sẵn customer_name
  // qua join nên không cần fetch riêng bảng customers nữa.
  //
  // Khối "Tổng quan đơn hàng" CEO yêu cầu 2026-08-06 phải có số Ý NGHĨA
  // (tháng này/tháng trước/năm nay/năm trước) chứ không phải tổng dồn "Tất
  // cả thời gian" như bảng bên dưới mặc định — gọi RPC lần THỨ 2, độc lập
  // hoàn toàn với mọi bộ lọc của bảng (trạng thái/tìm kiếm/chưa thanh toán),
  // chỉ khác nhau ở khoảng ngày (kỳ tổng quan) — page_size=1 vì chỉ cần
  // .stats/.totalCount, không cần rows.
  // Số đơn từng view (1 lần quét) + số đơn web mới (hiện 1 lần ở tab).
  const viewCountsPromise = Promise.all([
    supabase.rpc("orders_view_counts" as never, { p_branch_id: branchId } as never),
    (supabase as unknown as SupabaseClient).from("website_orders").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const [rpcRes, overviewRes, { data: branches }, invoicePendingRes] = await Promise.all([
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
      p_unpaid_only: unpaidOnly,
      p_view: activeView,
    }),
    showStats
      ? supabase.rpc("orders_page_list", {
          p_branch_id: branchId,
          p_status: "all",
          p_range_start: overviewDateRange?.start ?? null,
          p_range_end: overviewDateRange?.end ?? null,
          p_search: null,
          p_sort: null,
          p_dir: "asc",
          p_page: 1,
          p_page_size: 1,
          p_unpaid_only: false,
        })
      : Promise.resolve({ data: null }),
    supabase.from("branches").select("id, name").order("position"),
    // Sổ hoá đơn đỏ (CEO 2026-09-02): đếm đơn hoàn tất chưa xuất HĐ để kế
    // toán thấy việc ngay từ trang Đơn hàng — không theo kỳ tổng quan vì
    // việc tồn là tồn, bất kể đơn thuộc tháng nào.
    showStats
      ? supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .not("completed_at", "is", null)
          .is("cancelled_at", null)
          .is("invoice_issued_at", null)
          .eq("invoice_not_needed", false)
      : Promise.resolve({ count: null }),
  ]);

  const [viewCountsRes, webNewRes] = await viewCountsPromise;
  const viewCounts = (viewCountsRes.data ?? {}) as unknown as ViewCounts;
  const webNew = webNewRes.count ?? 0;
  // Tab view riêng đang sáng khi bộ lọc trên URL khớp đúng view đã lưu.
  const currentQuery = (() => {
    const p = new URLSearchParams();
    const add = (k: string, v?: string) => v && p.set(k, v);
    add("status", status);
    add("range", range);
    add("from", from);
    add("to", to);
    add("sort", sort);
    add("dir", dir);
    add("search", search);
    add("paid", paid);
    add("view", view);
    add("branch", branchToggle?.selectedId ?? undefined);
    return [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
  })();
  const normalize = (q: string) => [...new URLSearchParams(q).entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
  const viewHref = (key: string) => {
    const p = new URLSearchParams();
    p.set("view", key);
    if (branchToggle?.selectedId) p.set("branch", branchToggle.selectedId);
    return `?${p.toString()}`;
  };
  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));

  let result = (rpcRes.data ?? { totalCount: 0, stats: EMPTY_STATS, rows: [] }) as OrdersPageListResult;
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
      p_unpaid_only: unpaidOnly,
      p_view: activeView,
    });
    if (refetched) result = refetched as OrdersPageListResult;
  }

  const totalCount = result.totalCount;
  const orders = result.rows;
  const customerNameById = new Map(orders.map((o) => [o.customer_id, o.customer_name ?? "—"]));

  const overviewStats = (
    (overviewRes as { data: OrdersPageListResult | null }).data?.stats ?? EMPTY_STATS
  );
  const overviewTotalCount = (overviewRes as { data: OrdersPageListResult | null }).data?.totalCount ?? 0;
  const overviewProcessingCount =
    overviewTotalCount - overviewStats.completedCount - overviewStats.cancelledCount;
  // Bấm thẻ "Chưa thanh toán hết" → lọc bảng bên dưới đúng theo kỳ tổng
  // quan đang chọn + chỉ còn đơn chưa thanh toán hết, bỏ mọi bộ lọc khác
  // (trạng thái/tìm kiếm/trang) để không gây nhầm lẫn kết quả.
  const unpaidLinkParams = new URLSearchParams();
  if (overviewPeriod !== "this_month") unpaidLinkParams.set("overview", overviewPeriod);
  unpaidLinkParams.set("range", overviewPeriod);
  unpaidLinkParams.set("paid", "unpaid");
  if (branchToggle?.selectedId) unpaidLinkParams.set("branch", branchToggle.selectedId);
  const unpaidHref = `?${unpaidLinkParams.toString()}`;

  // Bỏ lọc "chưa thanh toán hết" nhưng GIỮ NGUYÊN mọi lựa chọn khác đang có
  // (trạng thái/khoảng ngày/tìm kiếm/sắp xếp/kỳ tổng quan) — chỉ xoá đúng
  // tham số `paid`.
  const clearUnpaidParams = new URLSearchParams();
  if (status) clearUnpaidParams.set("status", status);
  if (range) clearUnpaidParams.set("range", range);
  if (from) clearUnpaidParams.set("from", from);
  if (to) clearUnpaidParams.set("to", to);
  if (sort) clearUnpaidParams.set("sort", sort);
  if (dir) clearUnpaidParams.set("dir", dir);
  if (search) clearUnpaidParams.set("search", search);
  if (overview) clearUnpaidParams.set("overview", overview);
  if (branchToggle?.selectedId) clearUnpaidParams.set("branch", branchToggle.selectedId);
  const clearUnpaidQuery = clearUnpaidParams.toString();
  const clearUnpaidHref = clearUnpaidQuery ? `?${clearUnpaidQuery}` : "?";

  const chartsHref = (() => {
    const p = new URLSearchParams(currentQuery);
    if (showCharts) p.delete("charts");
    else p.set("charts", "1");
    const q = p.toString();
    return q ? `?${q}` : "?";
  })();
  const vatTotal = (o: OrderRow) => Math.round(o.total_value * 1.08);
  const attention = (o: OrderRow) => {
    const out: { label: string; tone: string }[] = [];
    if (o.cancelled_at) return out;
    if (o.no_serial) out.push({ label: "Chưa gán serial", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" });
    if (o.no_driver) out.push({ label: "Chưa người giao", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" });
    if (o.delivered_at && o.remaining >= 1000)
      out.push({ label: `Còn nợ ${currencyFormatter.format(Math.round(o.remaining))}đ`, tone: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" });
    if (o.override_reason)
      out.push({
        label: `Lý do: ${o.override_reason.length > 40 ? `${o.override_reason.slice(0, 40)}…` : o.override_reason}`,
        tone: "bg-amber-50 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800",
      });
    if (o.invoice_pending) out.push({ label: "Chờ HĐ", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" });
    return out;
  };
  const statusBadge = (order: OrderRow) =>
    order.cancelled_at ? (
      <Badge variant="destructive">Đã huỷ</Badge>
    ) : order.completed_at ? (
      <Badge>Hoàn tất</Badge>
    ) : (
      <Badge variant="outline">{ORDER_FLOW_LABELS[orderFlowStage(order.status)]}</Badge>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">Đơn hàng</h2>
        <div className="flex items-center gap-2">
          {branchToggle && <OrdersBranchToggle branches={branchList} value={branchToggle.selectedId} />}
          <QuickOrderDialog branches={branchList} />
        </div>
      </div>

      {/* Ô tìm đơn to ngay dưới tiêu đề (CEO 2026-10-03). Đang tìm thì tìm
          trong Tất cả đơn, bỏ qua view. */}
      <SearchInput
        key={activeSearch}
        paramName="search"
        placeholder="Tìm đơn theo mã đơn, tên khách hàng — gõ rồi Enter..."
        value={activeSearch}
        resetParams={["page"]}
        size="lg"
        className="w-full max-w-2xl"
      />

      {/* View lưu sẵn (Grok tách gọn CRM 10/10 giai đoạn 2) + view riêng của mình. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SYSTEM_VIEWS.map((v) => {
          const on = activeView === v.key && !activeSearch;
          const count = viewCounts[v.key] ?? 0;
          return (
            <Link
              key={v.key}
              href={viewHref(v.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : `hover:bg-muted ${"alert" in v && count ? "border-destructive/50 text-destructive" : ""}`
              }`}
            >
              {v.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-muted"}`}>
                {currencyFormatter.format(count)}
              </span>
            </Link>
          );
        })}
        <Link
          href="/orders/web"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium hover:bg-muted ${
            webNew ? "border-violet-400 text-violet-700 dark:text-violet-300" : ""
          }`}
        >
          Đơn web mới
          <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{webNew}</span>
        </Link>
        {savedViews.map((sv) => {
          const on = normalize(sv.query) === currentQuery;
          return (
            <Link
              key={sv.id}
              href={sv.query ? `?${sv.query}` : "?"}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${
                on ? "border-sky-600 bg-sky-600 text-white" : "border-sky-300 text-sky-800 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950"
              }`}
            >
              {sv.name}
              <DeleteSavedViewButton id={sv.id} name={sv.name} />
            </Link>
          );
        })}
        <SaveViewButton />
      </div>

      {/* 1 dải số liệu gọn theo kỳ — biểu đồ gập sau "Mở biểu đồ". */}
      {showStats && !activeSearch && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-2.5 text-sm">
            <span>
              <span className="text-muted-foreground">Tổng đơn</span>{" "}
              <b className="tabular-nums">{currencyFormatter.format(overviewTotalCount)}</b>
            </span>
            <span>
              <span className="text-muted-foreground">Đang xử lý</span>{" "}
              <b className="tabular-nums">{currencyFormatter.format(overviewProcessingCount)}</b>
            </span>
            <span>
              <span className="text-muted-foreground">Hoàn tất</span>{" "}
              <b className="tabular-nums">{currencyFormatter.format(overviewStats.completedCount)}</b>
            </span>
            <span>
              <span className="text-muted-foreground">Huỷ</span>{" "}
              <b className="tabular-nums">{currencyFormatter.format(overviewStats.cancelledCount)}</b>
            </span>
            <span>
              <span className="text-muted-foreground">Doanh số</span>{" "}
              <b className="tabular-nums">{currencyFormatter.format(Math.round(overviewStats.totalRevenue))}đ</b>
            </span>
            <Link href={unpaidHref} className="hover:underline">
              <span className="text-muted-foreground">Chưa thu đủ</span>{" "}
              <b className="tabular-nums text-destructive">
                {currencyFormatter.format(overviewStats.unpaidCount)} · {currencyFormatter.format(Math.round(overviewStats.unpaidAmount))}đ
              </b>
            </Link>
            {invoicePendingRes.count !== null && (
              <Link href="/invoices" className="hover:underline">
                <span className="text-muted-foreground">Chờ HĐ</span>{" "}
                <b className="tabular-nums">{invoicePendingRes.count ?? 0}</b>
              </Link>
            )}
            <span className="ml-auto flex items-center gap-2">
              <OrdersOverviewPeriodToggle value={overviewPeriod} />
              <Link
                href={chartsHref}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                aria-expanded={showCharts}
              >
                <BarChart3 className="size-3.5" />
                {showCharts ? "Gập biểu đồ" : "Mở biểu đồ"}
                <ChevronDown className={`size-3.5 transition-transform ${showCharts ? "rotate-180" : ""}`} />
              </Link>
            </span>
          </div>
          {showCharts && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OrdersStatusDonutChart
                processingCount={overviewProcessingCount}
                completedCount={overviewStats.completedCount}
                cancelledCount={overviewStats.cancelledCount}
              />
              <OrdersCollectionProgress vatRevenue={overviewStats.totalRevenue} unpaidAmount={overviewStats.deliveredUnpaidAmount} />
            </div>
          )}
        </div>
      )}

      {/* Bộ lọc nâng cao: 12 trạng thái, khoảng ngày, chưa thu đủ, phạm vi kho. */}
      <details className="group" open={!!(status || range || unpaidOnly)}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" />
          Bộ lọc nâng cao
          {(status || range || unpaidOnly) && <span className="text-xs text-primary">· đang lọc</span>}
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OrderStatusFilter value={activeStatus} />
          <OrderDateRangeFilter preset={activeRange} from={from ?? ""} to={to ?? ""} />
          {unpaidOnly && (
            <Link
              href={clearUnpaidHref}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Chỉ hiện đơn chưa thu đủ ×
            </Link>
          )}
          {branchScope && <OrderBranchScopeFilter value={branchScope.value} branchName={branchScope.branchName} />}
        </div>
      </details>

      {/* Điện thoại (< md): mỗi đơn 1 thẻ (đề xuất CRM v2 §4.6). */}
      <div className="space-y-2 md:hidden">
        {orders.map((order) => {
          const name = customerNameById.get(order.customer_id) ?? "—";
          return (
            <Link key={order.id} href={`/orders/${order.id}`} className="block rounded-lg border bg-card p-3 text-sm active:bg-muted">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{order.order_code}</span>
                <BranchBadge name={branchNameById.get(order.pickup_branch_id) ?? "—"} />
                <span className="ml-auto">{statusBadge(order)}</span>
              </div>
              <p className="mt-1 truncate">{name}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {order.rental_start_at ? dateTimeFormatter.format(new Date(order.rental_start_at)) : "—"} →{" "}
                  {order.rental_end_at ? dateTimeFormatter.format(new Date(order.rental_end_at)) : "—"}
                </span>
                <span className="font-semibold text-foreground tabular-nums">{currencyFormatter.format(vatTotal(order))}đ</span>
              </div>
              {attention(order).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {attention(order).map((a) => (
                    <span key={a.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.tone}`}>
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
        {!orders.length && <p className="py-6 text-center text-sm text-muted-foreground">Không có đơn hàng nào.</p>}
      </div>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Mã đơn</TableHead>
            <SortableTableHead sortKey="customer" label="Khách hàng" />
            <TableHead className="w-24">Kho</TableHead>
            <SortableTableHead sortKey="rental_start_at" label="Nhận → Trả" />
            <SortableTableHead sortKey="status" label="Khâu hiện tại" />
            <TableHead>Phụ trách</TableHead>
            <SortableTableHead sortKey="total_value" label="Tổng (VAT)" />
            <TableHead className="text-right">Đã thu</TableHead>
            <TableHead>Cần chú ý</TableHead>
            {canDelete && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <ClickableTableRow key={order.id} href={`/orders/${order.id}`}>
              <TableCell className="font-medium whitespace-nowrap">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.order_code}
                </Link>
              </TableCell>
              <TableCell className="max-w-64">
                <div className="flex items-center gap-2">
                  <CustomerAvatar id={order.customer_id} name={customerNameById.get(order.customer_id) ?? "—"} />
                  <span className="truncate">{customerNameById.get(order.customer_id) ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell>
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
              <TableCell className="text-xs whitespace-nowrap tabular-nums">
                {order.rental_start_at ? dateTimeFormatter.format(new Date(order.rental_start_at)) : "—"}
                <span className="block text-muted-foreground">
                  → {order.rental_end_at ? dateTimeFormatter.format(new Date(order.rental_end_at)) : "—"}
                </span>
              </TableCell>
              <TableCell>{statusBadge(order)}</TableCell>
              <TableCell className="max-w-32 truncate text-sm text-muted-foreground">{order.owner_name ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{currencyFormatter.format(vatTotal(order))}đ</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
                {order.paid_amount ? `${currencyFormatter.format(Math.round(order.paid_amount))}đ` : "—"}
              </TableCell>
              <TableCell>
                <div className="flex max-w-56 flex-wrap gap-1">
                  {attention(order).map((a) => (
                    <span key={a.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${a.tone}`}>
                      {a.label}
                    </span>
                  ))}
                </div>
              </TableCell>
              {canDelete && (
                <TableCell>
                  {/* Xoá chỉ trong menu ⋯, phải gõ đúng mã đơn (giai đoạn 2). */}
                  <ConfirmDeleteButton
                    inMenu
                    requireText={order.order_code}
                    confirmMessage={`Xoá đơn hàng "${order.order_code}"? Toàn bộ dữ liệu của đơn sẽ bị xoá, không thể hoàn tác.`}
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
              <TableCell colSpan={canDelete ? 10 : 9} className="text-center text-muted-foreground">
                Không có đơn hàng nào khớp bộ lọc.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PaginationControls page={currentPage} totalPages={totalPages} totalCount={totalCount} itemLabel="đơn hàng" />
    </div>
  );
}
