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
import { SearchInput } from "@/components/search-input";
import { PaginationControls } from "@/components/pagination-controls";
import { CustomerAvatar } from "@/components/customer-avatar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildCustomerReportRows } from "@/lib/customer-reports";
import type { CustomerType } from "@/types/database";
import { CustomerDialog } from "./customer-dialog";
import { DeleteCustomerButton } from "./delete-customer-button";
import { CustomerReportSection } from "./customer-report-section";
import { SortableTableHead } from "@/components/sortable-table-head";

const CUSTOMER_TYPE_LABELS = { individual: "Cá nhân", company: "Công ty" } as const;
const PAGE_SIZE = 20;
const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const SORT_KEYS = ["name", "customer_type", "orderCount", "totalRevenue"] as const;
type SortKey = (typeof SORT_KEYS)[number];
function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  address: string | null;
  customer_type: CustomerType;
  tax_code: string | null;
  deposit_percentage: number;
  created_at: string;
  orderCount: number;
  totalRevenue: number;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const { search, page: pageParam, sort, dir } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  // Số lượng đơn/doanh số là giá trị suy ra (join orders/payments), không
  // phải cột trong bảng customers — không thể .order()/.range() ở tầng
  // Postgres theo các cột này. Lấy TOÀN BỘ khách hàng + đơn hàng (đằng nào
  // cũng cần đủ cho khối báo cáo phía trên), lọc/sắp/phân trang gộp 1 lần
  // trong JS thay vì query riêng cho bảng danh sách.
  // Cửa hàng trưởng chỉ thấy khách hàng ĐÃ TỪNG phát sinh đơn ở chi nhánh
  // mình — bảng customers dùng chung toàn hệ thống nên phải suy ra qua đơn
  // hàng (tính cả chiều giao lẫn chiều thu hồi, khớp cách lọc ở /orders).
  const viewer = await getCurrentEmployee();
  const branchId =
    viewer && !MANAGE_ROLES.includes(viewer.role) ? viewer.branch_id : null;

  const [allCustomersRaw, ordersRaw, paymentsRaw] = await Promise.all([
    fetchAllRows<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      notes: string | null;
      address: string | null;
      customer_type: CustomerType;
      tax_code: string | null;
      deposit_percentage: number;
      created_at: string;
    }>((from, to) =>
      supabase
        .from("customers")
        .select(
          "id, name, phone, email, notes, address, customer_type, tax_code, deposit_percentage, created_at",
        )
        .range(from, to),
    ),
    fetchAllRows<{
      id: string;
      customer_id: string;
      total_value: number;
      order_date: string;
      cancelled_at: string | null;
      pickup_branch_id: string;
      return_branch_id: string;
    }>((from, to) =>
      supabase
        .from("orders")
        .select(
          "id, customer_id, total_value, order_date, cancelled_at, pickup_branch_id, return_branch_id",
        )
        .range(from, to),
    ),
    fetchAllRows<{ order_id: string; amount: number }>((from, to) =>
      supabase.from("order_payments").select("order_id, amount").range(from, to),
    ),
  ]);

  const orders = branchId
    ? ordersRaw.filter(
        (o) => o.pickup_branch_id === branchId || o.return_branch_id === branchId,
      )
    : ordersRaw;
  const branchCustomerIds = branchId ? new Set(orders.map((o) => o.customer_id)) : null;
  const allCustomers = branchCustomerIds
    ? allCustomersRaw.filter((c) => branchCustomerIds.has(c.id))
    : allCustomersRaw;
  const branchOrderIds = branchId ? new Set(orders.map((o) => o.id)) : null;
  const payments = branchOrderIds
    ? paymentsRaw.filter((p) => branchOrderIds.has(p.order_id))
    : paymentsRaw;

  const reportById = new Map(
    buildCustomerReportRows(allCustomers, orders, payments).map((r) => [r.id, r]),
  );
  const allRows: CustomerRow[] = allCustomers.map((c) => ({
    ...c,
    orderCount: reportById.get(c.id)?.orderCount ?? 0,
    totalRevenue: reportById.get(c.id)?.totalRevenue ?? 0,
  }));

  const searchLower = activeSearch.toLowerCase();
  const filteredRows = activeSearch
    ? allRows.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) || (r.phone ?? "").toLowerCase().includes(searchLower),
      )
    : allRows;

  const sortedRows = [...filteredRows].sort((a, b) => {
    const dirMult = activeDir === "asc" ? 1 : -1;
    switch (activeSort) {
      case "name":
        return dirMult * a.name.localeCompare(b.name, "vi");
      case "customer_type":
        return (
          dirMult *
          CUSTOMER_TYPE_LABELS[a.customer_type].localeCompare(CUSTOMER_TYPE_LABELS[b.customer_type], "vi")
        );
      case "orderCount":
        return dirMult * (a.orderCount - b.orderCount);
      case "totalRevenue":
        return dirMult * (a.totalRevenue - b.totalRevenue);
      default:
        return b.created_at.localeCompare(a.created_at);
    }
  });

  const safeTotalCount = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const customerList = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <CustomerDialog />
      </div>

      <CustomerReportSection customers={allCustomers} orders={orders} payments={payments} />

      <div className="space-y-3">
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm theo tên, số điện thoại..."
          value={activeSearch}
          resetParams={["page"]}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" label="Tên" />
              <SortableTableHead sortKey="customer_type" label="Loại" />
              <TableHead>Điện thoại</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <SortableTableHead sortKey="orderCount" label="Số lượng đơn" />
              <SortableTableHead sortKey="totalRevenue" label="Tổng doanh số" />
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customerList.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${customer.id}`} className="flex items-center gap-2 hover:underline">
                    <CustomerAvatar id={customer.id} name={customer.name} />
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</Badge>
                </TableCell>
                <TableCell>{customer.phone ?? "—"}</TableCell>
                <TableCell className="max-w-80 truncate">{customer.address ?? "—"}</TableCell>
                <TableCell>{customer.orderCount}</TableCell>
                <TableCell>{currencyFormatter.format(customer.totalRevenue)}đ</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CustomerDialog customer={customer} />
                    <DeleteCustomerButton id={customer.id} name={customer.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!customerList.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {activeSearch ? "Không tìm thấy khách hàng nào." : "Chưa có khách hàng nào."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <PaginationControls page={page} totalPages={totalPages} totalCount={safeTotalCount} itemLabel="khách hàng" />
      </div>
    </div>
  );
}
