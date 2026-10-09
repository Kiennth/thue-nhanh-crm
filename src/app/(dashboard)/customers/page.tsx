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
import { maskIdNumber } from "@/lib/customer-validation";
import { DeleteCustomerButton } from "./delete-customer-button";
import {
  CustomerReportSection,
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
  contact_name: string | null;
  wants_vat: boolean;
  invoice_email: string | null;
  needs_review: boolean;
  budget_unit_code: string | null;
  representative_name: string | null;
  representative_title: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
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
  contact_name: string | null;
  wants_vat: boolean;
  invoice_email: string | null;
  needs_review: boolean;
  budget_unit_code: string | null;
  representative_name: string | null;
  representative_title: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
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
    tab?: string;
    filter?: string;
  }>;
}) {
  const { search, page: pageParam, sort, dir, overview, tab, filter } = await searchParams;
  // Chip "Khách cần bổ sung" (B6): dữ liệu MST/CCCD cũ lệch mẫu.
  const needsReviewOnly = filter === "needs_review";
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
  // Số CCCD đủ chỉ Giám đốc / Admin / Kế toán xem; còn lại "1234xxxx" (CEO 09/10).
  const canViewIdNumber = !!viewer && MANAGE_ROLES.includes(viewer.role);
  // 2 tab (đề xuất CRM v2 §4.7, như trang Thiết bị): "Danh sách khách" mặc
  // định — danh sách lên trước; "Báo cáo" chỉ tính khi mở đúng tab.
  const reportTab = tab === "report" && !isAdmin;

  // Toàn bộ tổng hợp (thống kê, biểu đồ, xếp hạng, công nợ) + danh sách phân
  // trang đều tính trong Postgres qua 2 RPC — trước đây trang này kéo ~21.000
  // dòng thô (5.5k khách + 10k đơn + 6k thanh toán, ~24 lượt gọi) về Worker
  // chỉ để cộng trừ ra vài chục con số, giờ chỉ nhận đúng phần hiển thị.
  // security definer + guard nhân viên trong hàm (xem migration
  // 20260802010000) vì mốc "khách mới với cả công ty" cần đọc đơn mọi chi
  // nhánh trong khi RLS cắt orders theo chi nhánh với role thường.
  const [reportRes, listRes, needsReviewRes] = await Promise.all([
    reportTab
      ? supabase.rpc("customer_page_report", { p_branch_id: reportBranchId })
      : Promise.resolve({ data: null }),
    supabase.rpc("customer_page_list", {
      p_branch_id: null,
      p_search: activeSearch || null,
      p_sort: activeSort ?? "created_at",
      p_dir: activeDir,
      p_page: requestedPage,
      p_page_size: PAGE_SIZE,
      p_filter: needsReviewOnly ? "needs_review" : null,
    }),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);
  const needsReviewCount = needsReviewRes.count ?? 0;

  const rawReport = (reportRes.data ?? {}) as Partial<CustomerReportData> & { error?: string };
  const reportData: CustomerReportData = {
    // Kỳ không có dữ liệu thì RPC bỏ hẳn key trong map — component tự ?? []
    // theo từng kỳ, ở đây chỉ cần chống null cho cả map.
    periodTopCompanies: rawReport.periodTopCompanies ?? {},
    periodDebt: rawReport.periodDebt ?? {},
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
    contact_name: r.contact_name,
    wants_vat: r.wants_vat,
    invoice_email: r.invoice_email,
    needs_review: r.needs_review,
    budget_unit_code: r.budget_unit_code,
    representative_name: r.representative_name,
    representative_title: r.representative_title,
    bank_account_number: r.bank_account_number,
    bank_name: r.bank_name,
    deposit_percentage: r.deposit_percentage,
    created_at: r.created_at,
    orderCount: Number(r.order_count),
    totalRevenue: Number(r.total_revenue),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <CustomerDialog canViewIdNumber={canViewIdNumber} />
      </div>

      {/* Ô tìm khách to, đặt ngay dưới tiêu đề (CEO 2026-10-03) — trước nằm
          nhỏ dưới khối báo cáo, phải cuộn mới thấy. */}
      {!reportTab && (
        <SearchInput
          key={activeSearch}
          paramName="search"
          placeholder="Tìm khách theo tên, SĐT, MST, CCCD, email, mã ĐVQHNS — gõ rồi Enter..."
          value={activeSearch}
          resetParams={["page"]}
          size="lg"
          className="w-full max-w-2xl"
        />
      )}
      {!reportTab && (needsReviewCount > 0 || needsReviewOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={needsReviewOnly ? "/customers" : "/customers?filter=needs_review"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
              needsReviewOnly ? "border-primary bg-primary text-primary-foreground" : "border-amber-400/60 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
            }`}
          >
            Khách cần bổ sung
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${needsReviewOnly ? "bg-white/20" : "bg-amber-100 dark:bg-amber-900"}`}>
              {needsReviewCount}
            </span>
            {needsReviewOnly && <span aria-hidden>×</span>}
          </Link>
          {needsReviewOnly && (
            <span className="text-xs text-muted-foreground">
              MST/CCCD cũ không khớp mẫu (cá nhân ghi dạng MST, công ty ghi CMND…) — mở khách, chọn đúng loại và lưu lại.
            </span>
          )}
        </div>
      )}

      {/* CEO chốt 2026-08-06: Admin bỏ luôn cả "Báo cáo khách hàng" tổng
          (trước đây vẫn giữ riêng công nợ để đôn đốc thu tiền — nay bỏ hết,
          không chỉ xếp hạng/khách nguội). */}
      {/* Đang tìm khách thì ẩn báo cáo — kết quả hiện ngay dưới ô tìm. */}
      {!isAdmin && (
        <div className="flex items-center gap-1 border-b">
          {(
            [
              { value: false, label: "Danh sách khách", href: "/customers" },
              { value: true, label: "Báo cáo", href: "/customers?tab=report" },
            ] as const
          ).map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                reportTab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {reportTab && (
        <CustomerReportSection
          data={reportData}
          overview={overview}
          showRankings={!reportBranchId}
          showDormant={!reportBranchId}
          showDebt={!reportBranchId}
        />
      )}

      {!reportTab && (
      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" label="Tên" />
              <SortableTableHead sortKey="customer_type" label="Loại" />
              <TableHead>Điện thoại</TableHead>
              {/* 1 cột tax_code: công ty = MST, cá nhân = CCCD (= MST cá nhân,
                  CEO 09/10) — CCCD che "1234xxxx" với vai trò không quản lý. */}
              <TableHead>MST / CCCD</TableHead>
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
                <TableCell className="tabular-nums">
                  {customer.customer_type === "company" ? (
                    (customer.tax_code ?? "—")
                  ) : customer.tax_code ? (
                    canViewIdNumber ? customer.tax_code : maskIdNumber(customer.tax_code)
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      Thiếu CCCD
                    </span>
                  )}
                  {customer.needs_review && (
                    <span className="ml-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                      Cần bổ sung
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-80 truncate">{customer.address ?? "—"}</TableCell>
                <TableCell>{customer.orderCount}</TableCell>
                <TableCell>{currencyFormatter.format(customer.totalRevenue)}đ</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CustomerDialog customer={customer} canViewIdNumber={canViewIdNumber} />
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
      )}
    </div>
  );
}
