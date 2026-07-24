import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { deleteOrder } from "@/lib/actions/orders";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import type { TaskType } from "@/types/database";
import { OrderDialog } from "./order-dialog";
import { OrderStatusFilter } from "./order-status-filter";
import { OrderDateRangeFilter } from "./order-date-range-filter";

const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPE_SEQUENCE as readonly string[]).includes(value);
}

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

// Dùng chung cho trang /orders (Admin/Kế toán/Quản lý chi nhánh — thấy tất cả
// chi nhánh) và phần nhúng vào Trang chủ của kỹ thuật/sales (branchId khác
// null — chỉ thấy đơn ở đúng chi nhánh mình).
export async function OrdersListSection({
  status,
  range,
  from,
  to,
  branchId,
  canDelete,
}: {
  status?: string;
  range?: string;
  from?: string;
  to?: string;
  branchId: string | null;
  canDelete: boolean;
}) {
  const activeStatus = status ?? "all";
  const activeRange: DateRangePreset = range && isDateRangePreset(range) ? range : "all";
  const dateRange = computeDateRange(activeRange, new Date(), { from, to });

  const supabase = await createClient();

  let ordersQuery = supabase.from("orders").select("*").order("order_date", { ascending: false });
  if (branchId) {
    // Đơn liên quan tới chi nhánh mình: hoặc giao tại đây, hoặc thu hồi về đây.
    ordersQuery = ordersQuery.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
  }
  if (activeStatus === "completed") {
    ordersQuery = ordersQuery.not("completed_at", "is", null);
  } else if (activeStatus === "cancelled") {
    ordersQuery = ordersQuery.not("cancelled_at", "is", null);
  } else if (isTaskType(activeStatus)) {
    ordersQuery = ordersQuery
      .eq("status", activeStatus)
      .is("completed_at", null)
      .is("cancelled_at", null);
  }
  if (dateRange) {
    ordersQuery = ordersQuery.gte("order_date", dateRange.start).lte("order_date", dateRange.end);
  }

  const [{ data: orders }, { data: branches }] = await Promise.all([
    ordersQuery,
    supabase.from("branches").select("id, name").order("name"),
  ]);

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

      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusFilter value={activeStatus} />
        <OrderDateRangeFilter preset={activeRange} from={from ?? ""} to={to ?? ""} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đơn</TableHead>
            <TableHead>Chi nhánh</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Ngày</TableHead>
            <TableHead>Doanh số</TableHead>
            <TableHead>Trạng thái</TableHead>
            {canDelete && <TableHead className="w-16"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders?.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.order_code}
                </Link>
              </TableCell>
              <TableCell>
                {branchNameById.get(order.pickup_branch_id) ?? "—"}
                {order.return_branch_id !== order.pickup_branch_id &&
                  ` → ${branchNameById.get(order.return_branch_id) ?? "—"}`}
              </TableCell>
              <TableCell>{customerNameById.get(order.customer_id) ?? "—"}</TableCell>
              <TableCell>{dateFormatter.format(new Date(order.order_date))}</TableCell>
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
              <TableCell colSpan={canDelete ? 7 : 6} className="text-center text-muted-foreground">
                Không có đơn hàng nào khớp bộ lọc.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
