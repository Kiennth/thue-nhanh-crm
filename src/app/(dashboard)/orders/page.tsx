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
import { getCurrentEmployee } from "@/lib/dal";
import { deleteOrder } from "@/lib/actions/orders";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import type { TaskType } from "@/types/database";
import { OrderDialog } from "./order-dialog";
import { OrderStatusFilter } from "./order-status-filter";

const DELETE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function isTaskType(value: string): value is TaskType {
  return (TASK_TYPE_SEQUENCE as readonly string[]).includes(value);
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = status ?? "all";

  const supabase = await createClient();

  let ordersQuery = supabase.from("orders").select("*").order("order_date", { ascending: false });
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

  const [{ data: orders }, { data: branches }, { data: customers }, employee] = await Promise.all([
    ordersQuery,
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    getCurrentEmployee(),
  ]);

  const canDelete = !!employee && DELETE_ROLES.includes(employee.role);
  const branchList = branches ?? [];
  const customerList = customers ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const customerNameById = new Map(customerList.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Đơn hàng</h1>
        <OrderDialog
          branches={branchList}
          customers={customerList}
          trigger={
            <Button>
              <Plus className="size-4" />
              Thêm đơn hàng
            </Button>
          }
        />
      </div>

      <OrderStatusFilter value={activeStatus} />

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
              <TableCell>{branchNameById.get(order.branch_id) ?? "—"}</TableCell>
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
