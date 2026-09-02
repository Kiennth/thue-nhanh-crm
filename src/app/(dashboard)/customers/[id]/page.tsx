import Link from "next/link";
import { notFound } from "next/navigation";
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
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { SortableTableHead } from "@/components/sortable-table-head";
import { CustomerDialog } from "../customer-dialog";
import { DeleteCustomerButton } from "../delete-customer-button";

const CUSTOMER_TYPE_LABELS = { individual: "Cá nhân", company: "Công ty" } as const;
const DEPOSIT_PERCENTAGE_LABELS: Record<number, string> = {
  100: "100% (mặc định)",
  50: "50%",
  0: "0% — khách thân thiết, miễn cọc",
};

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

const ORDER_SORT_KEYS = ["rental_start_at", "rental_end_at", "total_value"] as const;
type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];
function isOrderSortKey(value: string): value is OrderSortKey {
  return (ORDER_SORT_KEYS as readonly string[]).includes(value);
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { id } = await params;
  const { sort, dir } = await searchParams;
  const activeSort: OrderSortKey | null = sort && isOrderSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const supabase = await createClient();

  const viewer = await getCurrentEmployee();
  // Cửa hàng trưởng chỉ xem lịch sử đơn của khách TẠI chi nhánh mình; khách
  // chưa từng có đơn ở đây thì coi như không tồn tại (404) — khớp với danh
  // sách khách hàng đã lọc theo chi nhánh.
  const branchId = viewer && !MANAGE_ROLES.includes(viewer.role) ? viewer.branch_id : null;

  const [{ data: customer }, { data: orders }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    (() => {
      const q = supabase
        .from("orders")
        .select("id, order_code, pickup_branch_id, return_branch_id, rental_start_at, rental_end_at, total_value, status, completed_at, cancelled_at")
        .eq("customer_id", id);
      return (
        branchId
          ? q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`)
          : q
      ).order("order_date", { ascending: false });
    })(),
  ]);
  if (!customer) notFound();
  if (branchId && !(orders ?? []).length) notFound();

  const dirMult = activeDir === "asc" ? 1 : -1;
  const orderList = [...(orders ?? [])].sort((a, b) => {
    switch (activeSort) {
      case "rental_start_at":
        return dirMult * (a.rental_start_at ?? "").localeCompare(b.rental_start_at ?? "");
      case "rental_end_at":
        return dirMult * (a.rental_end_at ?? "").localeCompare(b.rental_end_at ?? "");
      case "total_value":
        return dirMult * (a.total_value - b.total_value);
      default:
        return 0;
    }
  });
  const branchIds = [...new Set(orderList.flatMap((o) => [o.pickup_branch_id, o.return_branch_id]))];
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, name").in("id", branchIds)
    : { data: [] };
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <div className="flex items-center gap-2">
          <CustomerDialog customer={customer} editTriggerVariant="outline" />
          <DeleteCustomerButton id={customer.id} name={customer.name} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin khách hàng</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Loại khách hàng</p>
            <p className="font-medium">
              <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</Badge>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Điện thoại</p>
            <p className="font-medium">{customer.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{customer.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MST / CCCD</p>
            <p className="font-medium">{customer.tax_code ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tiền cọc</p>
            <p className="font-medium">{DEPOSIT_PERCENTAGE_LABELS[customer.deposit_percentage]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Địa chỉ</p>
            <p className="font-medium">{customer.address ?? "—"}</p>
          </div>
          {customer.notes && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground">Ghi chú</p>
              <p className="font-medium">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Đơn hàng đã đặt ({orderList.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <SortableTableHead sortKey="rental_start_at" label="Ngày bắt đầu" />
                <SortableTableHead sortKey="rental_end_at" label="Ngày kết thúc" />
                <SortableTableHead sortKey="total_value" label="Doanh số" />
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderList.map((order) => (
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
                </TableRow>
              ))}
              {!orderList.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Khách hàng chưa có đơn hàng nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
