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
import { RewardDialog, type RewardEntryRow } from "./reward-dialog";
import type { PayrollBranchScope } from "./payroll-branch-period-toggle";

// Thứ tự hiển thị chi nhánh cố định (khớp màu ở BranchBadge) — chi nhánh nào
// không nằm trong danh sách này (nếu phát sinh sau) xếp cuối theo tên.
const BRANCH_ORDER = ["Hà Nội", "TP HCM", "Đà Nẵng", "HQ"];

const PAYROLL_BRANCH_SCOPES = ["thisMonth", "lastMonth", "thisYear", "lastYear", "custom"] as const;
function isPayrollBranchScope(value: string): value is PayrollBranchScope {
  return (PAYROLL_BRANCH_SCOPES as readonly string[]).includes(value);
}

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    payrollScope?: string;
    payrollCustomMonth?: string;
  }>;
}) {
  const {
    month: monthParam,
    payrollScope: payrollScopeParam,
    payrollCustomMonth,
  } = await searchParams;
  const month = monthParam ?? currentMonth();
  const payrollScope: PayrollBranchScope =
    payrollScopeParam && isPayrollBranchScope(payrollScopeParam) ? payrollScopeParam : "thisMonth";
  // Ô "chọn tháng bất kỳ" ở cuối toggle — mặc định bằng tháng đang xem trên
  // MonthNavigator cho tới khi người dùng tự chọn tháng khác.
  const customMonth = payrollCustomMonth ?? month;

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
  // Sổ thưởng đột xuất của tháng đang xem — chỉ Giám đốc thấy (người duy
  // nhất được tạo/xoá, RLS cũng chặn đúng vậy). Dùng chung getMonthRange
  // sẽ kéo thêm import — tự dựng khoảng [đầu tháng, đầu tháng sau) tại chỗ.
  const rewardRangeStart = `${month}-01`;
  const rewardRangeEnd =
    Number(month.split("-")[1]) === 12
      ? `${Number(month.split("-")[0]) + 1}-01-01`
      : `${month.split("-")[0]}-${String(Number(month.split("-")[1]) + 1).padStart(2, "0")}-01`;
  const [rows, prevRows, { data: branches }, { data: rewardEntries }] = await Promise.all([
    computeEmployeeMonthlyPerformance(month, performanceOptions),
    computeEmployeeMonthlyPerformance(prevMonth, performanceOptions),
    supabase.from("branches").select("id, name"),
    viewer.role === "giam_doc"
      ? supabase
          .from("reward_entries")
          .select("id, employee_id, entry_date, amount, reason")
          .gte("entry_date", rewardRangeStart)
          .lt("entry_date", rewardRangeEnd)
          .order("entry_date", { ascending: false })
      : Promise.resolve({ data: [] as RewardEntryRow[] }),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const branchSortIndex = (branchId: string | null) => {
    const name = branchId ? branchNameById.get(branchId) : undefined;
    if (!name) return BRANCH_ORDER.length + 1;
    const idx = BRANCH_ORDER.indexOf(name);
    return idx === -1 ? BRANCH_ORDER.length : idx;
  };
  // Gom theo chi nhánh (thứ tự cố định) rồi theo tên — dùng cho mọi nơi hiện
  // danh sách nhân viên trên trang này (thẻ tổng quan, biểu đồ cơ cấu, xuất
  // Excel) để nhất quán 1 thứ tự duy nhất.
  function byBranchThenName(a: EmployeeMonthlyPerformance, b: EmployeeMonthlyPerformance) {
    const branchDiff = branchSortIndex(a.branchId) - branchSortIndex(b.branchId);
    if (branchDiff !== 0) return branchDiff;
    return a.name.localeCompare(b.name, "vi");
  }
  const sortedRows = [...rows].sort(byBranchThenName);

  // Toggle dùng chung cho "Quỹ lương theo chi nhánh" + "Cơ cấu thu nhập theo
  // nhân viên" (2 khối này cùng 1 nguồn EmployeeMonthlyPerformance, chỉ khác
  // cách gộp — CEO chốt 2026-08-06 gộp chung 1 toggle thay vì tách riêng).
  // thisMonth/lastMonth tái dùng đúng rows/prevRows đã có (miễn phí, không
  // query thêm). thisYear/lastYear cần cộng dồn 12 tháng (giống khối Lợi
  // nhuận gộp ở Trang chủ, xem sumEmployeePerformanceAcrossMonths) — CHỈ
  // tính khi thật sự đang chọn kỳ đó, và chỉ cho canViewAll (khối này tự ẩn
  // với vai trò còn lại) để không cõng thêm 12 lượt query mỗi lần tải trang.
  const yearOfMonth = Number(yearStr);
  let scopeRows: EmployeeMonthlyPerformance[] = sortedRows;
  if (canViewAll && payrollScope === "lastMonth") {
    scopeRows = [...prevRows].sort(byBranchThenName);
  } else if (canViewAll && (payrollScope === "thisYear" || payrollScope === "lastYear")) {
    const targetYear = payrollScope === "thisYear" ? yearOfMonth : yearOfMonth - 1;
    const monthlyRows = await Promise.all(
      monthsOfYear(targetYear).map((m) => computeEmployeeMonthlyPerformance(m)),
    );
    scopeRows = sumEmployeePerformanceAcrossMonths(monthlyRows).sort(byBranchThenName);
  } else if (canViewAll && payrollScope === "custom") {
    scopeRows =
      customMonth === month
        ? sortedRows
        : (await computeEmployeeMonthlyPerformance(customMonth)).sort(byBranchThenName);
  }

  const branchColorIndexById = new Map(
    (branches ?? []).map((b) => [b.id, branchSortIndex(b.id) % 10]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bảng lương tháng</h1>
        <div className="flex flex-wrap items-center gap-2">
          {viewer.role === "giam_doc" && (
            <RewardDialog
              employees={sortedRows.map((row) => ({ id: row.id, name: row.name }))}
              entries={rewardEntries ?? []}
              monthLabel={month.split("-").reverse().join("/")}
            />
          )}
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
              rewardPay: row.rewardPay,
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
        scopeRows={scopeRows}
        payrollScope={payrollScope}
        customMonth={customMonth}
        canViewAll={canViewAll}
      />
    </div>
  );
}
