import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CustomerAvatar } from "@/components/customer-avatar";
import { createClient } from "@/lib/supabase/server";
import { deleteOrder } from "@/lib/actions/orders";
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

const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const PAGE_SIZE = 50;
const CHUNK = 1000;

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPE_SEQUENCE as readonly string[]).includes(value);
}

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface OrderFilters {
  branchId: string | null;
  activeStatus: string;
  dateRange: DateRange | null;
}

// Áp cùng 1 bộ lọc (chi nhánh/trạng thái/khoảng ngày) cho cả câu truy vấn
// tổng kết và câu truy vấn phân trang — tránh 2 nơi lệch logic.
function ordersQueryWithFilters<Q extends string>(
  supabase: SupabaseServerClient,
  selectColumns: Q,
  { branchId, activeStatus, dateRange }: OrderFilters,
) {
  let q = supabase.from("orders").select(selectColumns);
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

// Supabase/PostgREST giới hạn 1.000 dòng mỗi lần gọi — bảng tổng kết cần
// TOÀN BỘ đơn khớp bộ lọc (không chỉ trang hiện tại) nên phải gộp nhiều
// .range().
async function fetchOrderStats(supabase: SupabaseServerClient, filters: OrderFilters) {
  let totalCount = 0;
  let totalRevenue = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let from = 0;
  while (true) {
    const { data } = await ordersQueryWithFilters(
      supabase,
      "total_value, completed_at, cancelled_at",
      filters,
    )
      .order("id")
      .range(from, from + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const o of data) {
      totalCount += 1;
      totalRevenue += o.total_value;
      if (o.cancelled_at) cancelledCount += 1;
      else if (o.completed_at) completedCount += 1;
    }
    if (data.length < CHUNK) break;
    from += CHUNK;
  }
  return {
    totalCount,
    totalRevenue,
    completedCount,
    cancelledCount,
    processingCount: totalCount - completedCount - cancelledCount,
  };
}

// Nội dung trang /orders — Admin/Kế toán thấy tất cả chi nhánh (branchId
// null), các role khác chỉ thấy đơn liên quan tới chi nhánh mình.
export async function OrdersListSection({
  status,
  range,
  from,
  to,
  page,
  branchId,
  canDelete,
}: {
  status?: string;
  range?: string;
  from?: string;
  to?: string;
  page?: string;
  branchId: string | null;
  canDelete: boolean;
}) {
  const activeStatus = status ?? "all";
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "all";
  const dateRange = computeDateRange(activeRange, new Date(), { from, to });
  const filters: OrderFilters = { branchId, activeStatus, dateRange };

  const supabase = await createClient();

  const [stats, { data: branches }] = await Promise.all([
    fetchOrderStats(supabase, filters),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const totalPages = Math.max(1, Math.ceil(stats.totalCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  // .order("id") thứ 2 làm tie-breaker — nhiều đơn cùng order_date, nếu chỉ
  // sort theo order_date thì thứ tự giữa các trang không ổn định, gây trùng
  // hoặc bỏ sót dòng khi chuyển trang.
  const { data: orders } = await ordersQueryWithFilters(supabase, "*", filters)
    .order("order_date", { ascending: false })
    .order("id", { ascending: false })
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));

  // Chỉ tra tên đúng những khách hàng thực sự xuất hiện trong danh sách đơn
  // đang hiển thị — không select("*") toàn bộ khách hàng vì Supabase giới
  // hạn 1.000 dòng mỗi query (bảng khách hàng hiện có hơn 5.800 dòng).
  const orderCustomerIds = [...new Set((orders ?? []).map((o) => o.customer_id))];
  const { data: orderCustomers } =
    orderCustomerIds.length > 0
      ? await supabase.from("customers").select("id, name").in("id", orderCustomerIds)
      : { data: [] };
  const customerNameById = new Map((orderCustomers ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Đơn hàng</h2>
        <OrderDialog
          branches={branchList}
          trigger={
            <Button>
              <Plus className="size-4" />
              Thêm đơn hàng
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Tổng đơn (khớp bộ lọc)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.totalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Đang xử lý</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.processingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Hoàn tất</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.completedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Đã huỷ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.cancelledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Tổng doanh số</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {currencyFormatter.format(Math.round(stats.totalRevenue))}đ
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusFilter value={activeStatus} />
        <OrderDateRangeFilter preset={activeRange} from={from ?? ""} to={to ?? ""} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Mã đơn</TableHead>
            <TableHead className="w-28">Chi nhánh</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Ngày bắt đầu</TableHead>
            <TableHead>Ngày kết thúc</TableHead>
            <TableHead>Doanh số</TableHead>
            <TableHead>Trạng thái</TableHead>
            {canDelete && <TableHead className="w-16"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders?.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="max-w-28 truncate font-medium">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.order_code}
                </Link>
              </TableCell>
              <TableCell className="max-w-28 truncate">
                {branchNameById.get(order.pickup_branch_id) ?? "—"}
                {order.return_branch_id !== order.pickup_branch_id &&
                  ` → ${branchNameById.get(order.return_branch_id) ?? "—"}`}
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
            </TableRow>
          ))}
          {!orders?.length && (
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
        totalCount={stats.totalCount}
        itemLabel="đơn hàng"
      />
    </div>
  );
}
