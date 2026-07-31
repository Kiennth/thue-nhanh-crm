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
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/dal";
import {
  computeEmployeeMonthlyPerformance,
  currentMonth,
  MANAGE_ROLES,
} from "@/lib/employee-performance-charts";
import { MonthNavigator } from "./month-navigator";
import { ExportPayrollButton } from "./export-payroll-button";
import { PayrollOverview } from "./payroll-overview";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Thứ tự hiển thị chi nhánh cố định (khớp màu ở BranchBadge) — chi nhánh nào
// không nằm trong danh sách này (nếu phát sinh sau) xếp cuối theo tên.
const BRANCH_ORDER = ["Hà Nội", "TP HCM", "Đà Nẵng", "HQ"];

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();

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
    const branchDiff = branchSortIndex(a.branchId) - branchSortIndex(b.branchId);
    if (branchDiff !== 0) return branchDiff;
    return a.name.localeCompare(b.name, "vi");
  });

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
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bảng chi tiết — Tháng {month}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead>Nhân viên</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Lương cứng</TableHead>
                <TableHead className="text-right">Tổng khoán</TableHead>
                <TableHead className="text-right">Lắp đặt</TableHead>
                <TableHead className="text-right">Tháo dỡ</TableHead>
                <TableHead className="text-right">Support</TableHead>
                <TableHead className="text-right">Giao hàng</TableHead>
                <TableHead className="text-right">Thu hồi</TableHead>
                <TableHead className="text-right">OT</TableHead>
                <TableHead className="text-right">Thưởng</TableHead>
                <TableHead className="text-right">Tổng thu nhập</TableHead>
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
