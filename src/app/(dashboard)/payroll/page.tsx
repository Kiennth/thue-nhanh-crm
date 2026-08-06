import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BranchBadge } from "@/components/branch-badge";
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import {
  computeEmployeeMonthlyPerformance,
  currentMonth,
  MANAGE_ROLES,
  sumEmployeePerformanceAcrossMonths,
  type EmployeeMonthlyPerformance,
} from "@/lib/employee-performance-charts";
import { MonthNavigator } from "./month-navigator";
import { ExportPayrollButton } from "./export-payroll-button";
import { PayrollOverview } from "./payroll-overview";
import type { PayrollBranchScope } from "./payroll-branch-period-toggle";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Thứ tự hiển thị chi nhánh cố định (khớp màu ở BranchBadge) — chi nhánh nào
// không nằm trong danh sách này (nếu phát sinh sau) xếp cuối theo tên.
const BRANCH_ORDER = ["Hà Nội", "TP HCM", "Đà Nẵng", "HQ"];

// Các cột số tiền trong bảng chi tiết đều sắp xếp được — key trùng luôn tên
// trường trong EmployeeMonthlyPerformance để đỡ phải map thủ công.
const NUMERIC_SORT_KEYS = [
  "baseSalary",
  "totalCommission",
  "installationPayout",
  "removalPayout",
  "supportPayout",
  "deliveryPayout",
  "collectionPayout",
  "overtimePay",
  "bonus",
  "totalIncome",
] as const;
type NumericSortKey = (typeof NUMERIC_SORT_KEYS)[number];
type SortKey = NumericSortKey | "name";
function isSortKey(value: string): value is SortKey {
  return value === "name" || (NUMERIC_SORT_KEYS as readonly string[]).includes(value);
}

const PAYROLL_BRANCH_SCOPES = ["thisMonth", "lastMonth", "thisYear", "lastYear"] as const;
function isPayrollBranchScope(value: string): value is PayrollBranchScope {
  return (PAYROLL_BRANCH_SCOPES as readonly string[]).includes(value);
}

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sort?: string; dir?: string; payrollScope?: string }>;
}) {
  const { month: monthParam, sort, dir, payrollScope: payrollScopeParam } = await searchParams;
  const month = monthParam ?? currentMonth();
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const payrollScope: PayrollBranchScope =
    payrollScopeParam && isPayrollBranchScope(payrollScopeParam) ? payrollScopeParam : "thisMonth";

  const viewer = await getCurrentEmployee();
  if (!viewer) return null;

  const canViewAll = (MANAGE_ROLES as readonly string[]).includes(viewer.role);
  const performanceOptions = canViewAll
    ? undefined
    : viewer.role === "cua_hang_truong" && viewer.branch_id
      ? { branchId: viewer.branch_id }
      : { employeeIds: [viewer.id] };

  // Tháng liền trước — chỉ dùng để tính % biến động quỹ lương ở thẻ tổng quan.
  const [yearStr, monthStr] = month.split("-");
  const prevDate = new Date(Number(yearStr), Number(monthStr) - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const supabase = await createClient();
  const [rows, prevRows, { data: branches }] = await Promise.all([
    computeEmployeeMonthlyPerformance(month, performanceOptions),
    computeEmployeeMonthlyPerformance(prevMonth, performanceOptions),
    supabase.from("branches").select("id, name"),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const branchSortIndex = (branchId: string | null) => {
    const name = branchId ? branchNameById.get(branchId) : undefined;
    if (!name) return BRANCH_ORDER.length + 1;
    const idx = BRANCH_ORDER.indexOf(name);
    return idx === -1 ? BRANCH_ORDER.length : idx;
  };
  const sortedRows = [...rows].sort((a, b) => {
    // Có chọn cột để sắp xếp → bỏ qua gom nhóm theo chi nhánh, so trực tiếp
    // trên cột đó (tên thì so chuỗi tiếng Việt, còn lại là số tiền).
    if (activeSort) {
      const dirMult = activeDir === "asc" ? 1 : -1;
      if (activeSort === "name") return dirMult * a.name.localeCompare(b.name, "vi");
      return dirMult * (a[activeSort] - b[activeSort]);
    }
    const branchDiff = branchSortIndex(a.branchId) - branchSortIndex(b.branchId);
    if (branchDiff !== 0) return branchDiff;
    return a.name.localeCompare(b.name, "vi");
  });

  // Toggle "Quỹ lương theo chi nhánh" — CEO yêu cầu 2026-08-06. thisMonth/
  // lastMonth tái dùng đúng rows/prevRows đã có (miễn phí, không query
  // thêm). thisYear/lastYear cần cộng dồn 12 tháng (giống khối Lợi nhuận
  // gộp ở Trang chủ, xem sumEmployeePerformanceAcrossMonths) — CHỈ tính khi
  // thật sự đang chọn kỳ đó, và chỉ cho canViewAll (khối này tự ẩn với vai
  // trò còn lại) để không cõng thêm 12 lượt query mỗi lần tải trang.
  const yearOfMonth = Number(yearStr);
  let branchPayrollRows: EmployeeMonthlyPerformance[] = sortedRows;
  if (canViewAll && payrollScope === "lastMonth") {
    branchPayrollRows = prevRows;
  } else if (canViewAll && (payrollScope === "thisYear" || payrollScope === "lastYear")) {
    const targetYear = payrollScope === "thisYear" ? yearOfMonth : yearOfMonth - 1;
    const monthlyRows = await Promise.all(
      monthsOfYear(targetYear).map((m) => computeEmployeeMonthlyPerformance(m)),
    );
    branchPayrollRows = sumEmployeePerformanceAcrossMonths(monthlyRows);
  }

  const branchColorIndexById = new Map(
    (branches ?? []).map((b) => [b.id, branchSortIndex(b.id) % 10]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bảng lương tháng</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExportPayrollButton
            month={month}
            rows={sortedRows.map((row) => ({
              name: row.name,
              branchName: (row.branchId ? branchNameById.get(row.branchId) : undefined) ?? "—",
              baseSalary: row.baseSalary,
              totalCommission: row.totalCommission,
              installationPayout: row.installationPayout,
              removalPayout: row.removalPayout,
              supportPayout: row.supportPayout,
              deliveryPayout: row.deliveryPayout,
              collectionPayout: row.collectionPayout,
              overtimePay: row.overtimePay,
              bonus: row.bonus,
              totalIncome: row.totalIncome,
            }))}
          />
          <MonthNavigator month={month} />
        </div>
      </div>

      <PayrollOverview
        rows={sortedRows}
        prevRows={prevRows}
        month={month}
        branchName={
          // Cửa hàng trưởng: ghi rõ tên kho lên thẻ số liệu; Giám đốc/Kế
          // toán xem toàn công ty nên để trống.
          viewer.role === "cua_hang_truong" && viewer.branch_id
            ? branchNameById.get(viewer.branch_id)
            : undefined
        }
        branchNameById={branchNameById}
        branchColorIndexById={branchColorIndexById}
        branchPayrollRows={branchPayrollRows}
        payrollScope={payrollScope}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bảng chi tiết — Tháng {month}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" label="Nhân viên" />
                <TableHead>Chi nhánh</TableHead>
                <SortableTableHead sortKey="baseSalary" label="Lương cứng" align="right" />
                <SortableTableHead sortKey="totalCommission" label="Tổng khoán" align="right" />
                <SortableTableHead sortKey="installationPayout" label="Lắp đặt" align="right" />
                <SortableTableHead sortKey="removalPayout" label="Tháo dỡ" align="right" />
                <SortableTableHead sortKey="supportPayout" label="Support" align="right" />
                <SortableTableHead sortKey="deliveryPayout" label="Giao hàng" align="right" />
                <SortableTableHead sortKey="collectionPayout" label="Thu hồi" align="right" />
                <SortableTableHead sortKey="overtimePay" label="OT" align="right" />
                <SortableTableHead sortKey="bonus" label="Thưởng" align="right" />
                <SortableTableHead sortKey="totalIncome" label="Tổng thu nhập" align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {row.branchId ? (
                      <BranchBadge name={branchNameById.get(row.branchId) ?? "—"} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.baseSalary)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.totalCommission)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.installationPayout)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.removalPayout)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.supportPayout)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.deliveryPayout)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.collectionPayout)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.overtimePay)}đ</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(row.bonus)}đ</TableCell>
                  <TableCell className="text-right font-medium">
                    {currencyFormatter.format(row.totalIncome)}đ
                  </TableCell>
                </TableRow>
              ))}
              {!sortedRows.length && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground">
                    Không có dữ liệu.
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
