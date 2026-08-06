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
import type { CustomerType } from "@/types/database";
import { CustomerDialog } from "./customer-dialog";
import { DeleteCustomerButton } from "./delete-customer-button";
import {
  CustomerReportSection,
  EMPTY_PERIOD_STATS,
  EMPTY_PERIOD_BY_CUSTOMER_TYPE,
  type CustomerReportData,
} from "./customer-report-section";
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

// Dòng thô từ RPC customer_page_list — cột customers + 2 cột tổng hợp
// (snake_case theo SQL).
interface CustomerListRpcRow {
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
  order_count: number;
  total_revenue: number;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    page?: string;
    sort?: string;
    dir?: string;
    overview?: string;
  }>;
}) {
  const { search, page: pageParam, sort, dir, overview } = await searchParams;
  const activeSearch = search?.trim() ?? "";
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  // CEO chốt 2026-08-05: Cửa hàng trưởng/Kỹ thuật-Sales xem được TOÀN BỘ
  // khách hàng công ty (khách hàng dùng chung toàn hệ thống, không thuộc
  // riêng chi nhánh nào) — chỉ khối "report tổng quan" phía trên mới thu hẹp
  // về đúng chi nhánh mình quản lý. Trước đây 1 biến branchId lỡ dùng chung
  // cho cả 2 RPC nên danh sách khách cũng bị lọc theo chi nhánh, sai với
  // bản chất khách hàng không branch-scoped.
  const viewer = await getCurrentEmployee();
  const reportBranchId = viewer && !MANAGE_ROLES.includes(viewer.role) ? viewer.branch_id : null;
  const isAdmin = viewer?.role === "admin";

  // Toàn bộ tổng hợp (thống kê, biểu đồ, xếp hạng, công nợ) + danh sách phân
  // trang đều tính trong Postgres qua 2 RPC — trước đây trang này kéo ~21.000
  // dòng thô (5.5k khách + 10k đơn + 6k thanh toán, ~24 lượt gọi) về Worker
  // chỉ để cộng trừ ra vài chục con số, giờ chỉ nhận đúng phần hiển thị.
  // security definer + guard nhân viên trong hàm (xem migration
  // 20260802010000) vì mốc "khách mới với cả công ty" cần đọc đơn mọi chi
  // nhánh trong khi RLS cắt orders theo chi nhánh với role thường.
  const [reportRes, listRes] = await Promise.all([
    supabase.rpc("customer_page_report", { p_branch_id: reportBranchId }),
    supabase.rpc("customer_page_list", {
      p_branch_id: null,
      p_search: activeSearch || null,
      p_sort: activeSort ?? "created_at",
      p_dir: activeDir,
      p_page: requestedPage,
      p_page_size: PAGE_SIZE,
    }),
  ]);

  const rawReport = (reportRes.data ?? {}) as Partial<CustomerReportData> & { error?: string };
  const reportData: CustomerReportData = {
    // jsonb_agg trả null (không phải mảng rỗng) khi không có dòng nào.
    topCompanies: rawReport.topCompanies ?? [],
    debt: rawReport.debt ?? [],
    periodStats: rawReport.periodStats ?? EMPTY_PERIOD_STATS,
    periodByCustomerType: rawReport.periodByCustomerType ?? EMPTY_PERIOD_BY_CUSTOMER_TYPE,
  };

  const rawList = (listRes.data ?? {}) as { totalCount?: number; rows?: CustomerListRpcRow[] };
  const safeTotalCount = rawList.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const customerList: CustomerRow[] = (rawList.rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    address: r.address,
    customer_type: r.customer_type,
    tax_code: r.tax_code,
    deposit_percentage: r.deposit_percentage,
    created_at: r.created_at,
    orderCount: Number(r.order_count),
    totalRevenue: Number(r.total_revenue),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <CustomerDialog />
      </div>

      {/* CEO chốt 2026-08-06: Admin bỏ luôn cả "Báo cáo khách hàng" tổng
          (trước đây vẫn giữ riêng công nợ để đôn đốc thu tiền — nay bỏ hết,
          không chỉ xếp hạng/khách nguội). */}
      {!isAdmin && (
        <CustomerReportSection
          data={reportData}
          overview={overview}
          showRankings={!reportBranchId}
          showDormant={!reportBranchId}
          showDebt={!reportBranchId}
        />
      )}

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
