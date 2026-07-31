import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { BranchBadge } from "@/components/branch-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { PeriodPicker } from "@/components/period-picker";
import { SortableTableHead } from "@/components/sortable-table-head";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EXPENSE_ROLES } from "@/lib/roles";
import { deleteExpense } from "@/lib/actions/expenses";
import { deleteRecurringExpense } from "@/lib/actions/expenses";
import {
  fetchExpenseData,
  sumAmount,
  type ExpensePeriod,
  type ExpenseRow,
} from "@/lib/expense-reports";
import {
  expandRecurring,
  monthsBetween,
  type ExpandedRecurringRow,
} from "@/lib/recurring-expenses";
import { RecurringExpenseDialog } from "./recurring-expense-dialog";
import {
  computeEmployeeMonthlyPerformance,
  currentMonth,
  MANAGE_ROLES,
} from "@/lib/employee-performance-charts";
import {
  BranchExpenseChart,
  ExpenseTrendChart,
  type BranchExpensePoint,
  type ExpenseTrendPoint,
} from "./expense-charts";
import { categoryColor } from "./expense-colors";
import { ExpenseDialog } from "./expense-dialog";
import { CopyLastMonthButton, ExpensePeriodFilter } from "./expense-toolbar";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" });

const SORT_KEYS = ["expense_date", "amount"] as const;
type SortKey = (typeof SORT_KEYS)[number];
function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function isPeriod(value: string): value is ExpensePeriod {
  return value === "month" || value === "quarter" || value === "year";
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; period?: string; sort?: string; dir?: string }>;
}) {
  const { month: monthParam, period: periodParam, sort, dir } = await searchParams;
  const employee = await requireRole([...EXPENSE_ROLES]);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();
  const period: ExpensePeriod = periodParam && isPeriod(periodParam) ? periodParam : "month";
  const activeSort: SortKey | null = sort && isSortKey(sort) ? sort : null;
  const activeDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  // Cửa hàng trưởng: RLS đã cắt dữ liệu về kho mình; giấu thêm biểu đồ so
  // sánh chi nhánh (chỉ còn 1 kho thì so sánh vô nghĩa) và khoá dialog về
  // đúng kho.
  const isBranchManager = employee.role === "cua_hang_truong";

  // Quỹ lương là chi phí — CEO chốt gộp thẳng vào tab này. Tự lấy từ Bảng
  // lương (không nhập tay), CHỈ ở chế độ xem theo tháng: quý/năm phải tính
  // 3-12 tháng lương, vượt hạn mức subrequest của Cloudflare Workers.
  const payrollOptions = (MANAGE_ROLES as readonly string[]).includes(employee.role)
    ? undefined
    : employee.branch_id
      ? { branchId: employee.branch_id }
      : { employeeIds: [employee.id] };
  const prevMonthStr = (() => {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  })();

  const supabase = await createClient();
  const [{ data: branches }, data, payrollRows, prevPayrollRows] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    fetchExpenseData(period, month),
    period === "month"
      ? computeEmployeeMonthlyPerformance(month, payrollOptions)
      : Promise.resolve(null),
    period === "month"
      ? computeEmployeeMonthlyPerformance(prevMonthStr, payrollOptions)
      : Promise.resolve(null),
  ]);
  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const categoryNameById = new Map(data.categories.map((c) => [c.id, c.name]));
  const categoryIndexById = new Map(data.categories.map((c, i) => [c.id, i]));

  // "Trải" chi phí định kỳ ra từng kỳ trong khoảng đang xem — dòng ảo, không
  // nằm trong bảng expenses, nhưng được cộng vào mọi số liệu như dòng thật.
  const recurringPeriodRows = expandRecurring(
    data.recurringDefs,
    monthsBetween(data.range.start, data.range.end),
  );
  const recurringPrevRows = expandRecurring(
    data.recurringDefs,
    monthsBetween(data.range.prevStart, data.range.prevEnd),
  );
  const allPeriodRows: (ExpenseRow | ExpandedRecurringRow)[] = [
    ...data.periodRows,
    ...recurringPeriodRows,
  ];

  const operatingTotal = sumAmount(allPeriodRows);
  const prevOperatingTotal = sumAmount(data.previousPeriodRows) + sumAmount(recurringPrevRows);

  // Quỹ lương gom theo chi nhánh (chỉ có ở chế độ tháng).
  const payrollByBranch = new Map<string, number>();
  for (const r of payrollRows ?? []) {
    if (!r.branchId) continue;
    payrollByBranch.set(r.branchId, (payrollByBranch.get(r.branchId) ?? 0) + r.totalIncome);
  }
  const payrollTotal = (payrollRows ?? []).reduce((s, r) => s + r.totalIncome, 0);
  const prevPayrollTotal = (prevPayrollRows ?? []).reduce((s, r) => s + r.totalIncome, 0);
  const includesPayroll = payrollRows !== null;

  // Ô "Tổng chi": chế độ tháng đã gồm lương nên kỳ trước cũng phải gồm lương
  // — so hai con số khác cơ sở là tự lừa mình.
  const total = operatingTotal + (includesPayroll ? payrollTotal : 0);
  const prevTotal = prevOperatingTotal + (includesPayroll ? prevPayrollTotal : 0);
  const deltaPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  // Kho tốn nhất tính trên TỔNG (gồm lương nếu có) để khớp biểu đồ; hạng mục
  // lớn nhất chỉ so giữa các hạng mục nhập tay — lương gần như luôn đứng đầu,
  // đưa vào thì ô này thành vô dụng.
  const operatingByBranch = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const r of allPeriodRows) {
    operatingByBranch.set(
      r.branch_id,
      (operatingByBranch.get(r.branch_id) ?? 0) + Number(r.amount),
    );
    byCategory.set(r.category_id, (byCategory.get(r.category_id) ?? 0) + Number(r.amount));
  }
  const totalByBranch = new Map<string, number>();
  for (const [id, v] of operatingByBranch) totalByBranch.set(id, v);
  if (includesPayroll) {
    for (const [id, v] of payrollByBranch) totalByBranch.set(id, (totalByBranch.get(id) ?? 0) + v);
  }
  const topBranch = [...totalByBranch.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  // Hạng mục cho biểu đồ: các hạng mục thật + "Quỹ lương" ảo (màu riêng cố
  // định, luôn đứng cuối chồng).
  const PAYROLL_KEY = "__payroll";
  const chartCategories: { id: string; name: string; color?: string }[] = [
    ...data.categories,
    ...(includesPayroll
      ? [{ id: PAYROLL_KEY, name: "Quỹ lương (tự tính)", color: "var(--chart-6)" }]
      : []),
  ];

  // Điểm cho biểu đồ cột chồng theo chi nhánh — mọi chi nhánh có phát sinh
  // chi phí HOẶC lương.
  const branchPoints: BranchExpensePoint[] = [...totalByBranch.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([branchId]) => {
      const point: BranchExpensePoint = {
        branch: branchNameById.get(branchId) ?? "—",
      };
      for (const c of chartCategories) point[c.id] = 0;
      for (const r of allPeriodRows) {
        if (r.branch_id === branchId) {
          point[r.category_id] = (Number(point[r.category_id]) || 0) + Number(r.amount);
        }
      }
      if (includesPayroll) point[PAYROLL_KEY] = payrollByBranch.get(branchId) ?? 0;
      return point;
    });

  // Xu hướng 12 tháng (tổng mọi hạng mục, gồm cả định kỳ đã trải).
  const [ty, tm] = month.split("-").map(Number);
  const trendStartDate = new Date(ty, tm - 12, 1);
  const trendMonths = monthsBetween(
    `${trendStartDate.getFullYear()}-${String(trendStartDate.getMonth() + 1).padStart(2, "0")}-01`,
    data.range.end,
  );
  const trendByMonth = new Map<string, number>();
  for (const r of [...data.trendRows, ...expandRecurring(data.recurringDefs, trendMonths)]) {
    const key = r.expense_date.slice(0, 7);
    trendByMonth.set(key, (trendByMonth.get(key) ?? 0) + Number(r.amount));
  }
  const trendPoints: ExpenseTrendPoint[] = [...trendByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, t]) => ({ month: m, total: t }));

  const sortedRows = [...allPeriodRows].sort((a, b) => {
    const dirMult = activeDir === "asc" ? 1 : -1;
    if (activeSort === "amount") return dirMult * (Number(a.amount) - Number(b.amount));
    // mặc định + sort theo ngày
    return dirMult * a.expense_date.localeCompare(b.expense_date);
  });
  const recurringById = new Map(data.recurringDefs.map((d) => [d.id, d]));
  const isRecurringRow = (r: ExpenseRow | ExpandedRecurringRow): r is ExpandedRecurringRow =>
    "recurringId" in r;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Chi phí vận hành</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExpensePeriodFilter value={period} />
          <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          {period === "month" && <CopyLastMonthButton month={month} />}
          <RecurringExpenseDialog
            branches={branchList}
            categories={data.categories}
            lockedBranchId={isBranchManager ? employee.branch_id : undefined}
          />
          <ExpenseDialog
            branches={branchList}
            categories={data.categories}
            lockedBranchId={isBranchManager ? employee.branch_id : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Tổng chi ${data.range.label}${includesPayroll ? " (gồm lương)" : ""}${isBranchManager ? ` — kho ${branchNameById.get(employee.branch_id ?? "") ?? ""}` : ""}`}
          value={`${currencyFormatter.format(total)}đ`}
        >
          {includesPayroll && (
            <p className="text-xs text-muted-foreground">
              Vận hành {currencyFormatter.format(operatingTotal)}đ · Quỹ lương{" "}
              {currencyFormatter.format(payrollTotal)}đ
            </p>
          )}
          {deltaPct !== null && (
            <p
              className={`flex items-center gap-1 text-xs ${
                deltaPct > 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {deltaPct > 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {deltaPct > 0 ? "+" : ""}
              {deltaPct.toFixed(1)}% so với kỳ trước
            </p>
          )}
          {!includesPayroll && (
            <p className="text-xs text-muted-foreground">
              Chưa gồm quỹ lương — xem theo tháng để gộp lương.
            </p>
          )}
        </StatCard>

        <StatCard label="Số khoản chi trong kỳ" value={allPeriodRows.length} />

        {!isBranchManager && (
          <StatCard
            label="Chi nhánh tốn nhất"
            value={topBranch ? (branchNameById.get(topBranch[0]) ?? "—") : "—"}
          >
            {topBranch && (
              <p className="text-xs text-muted-foreground">
                {currencyFormatter.format(topBranch[1])}đ
              </p>
            )}
          </StatCard>
        )}

        <StatCard
          label="Hạng mục lớn nhất"
          value={topCategory ? (categoryNameById.get(topCategory[0]) ?? "—") : "—"}
        >
          {topCategory && (
            <p className="text-xs text-muted-foreground">
              {currencyFormatter.format(topCategory[1])}đ ·{" "}
              {total > 0 ? ((topCategory[1] / total) * 100).toFixed(0) : 0}% tổng chi
            </p>
          )}
        </StatCard>
      </div>

      {!isBranchManager && branchPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">So sánh chi phí giữa các chi nhánh</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tổng chi {data.range.label} của từng chi nhánh, tách theo hạng mục
              {includesPayroll && " — đã gộp quỹ lương tự tính từ Bảng lương"}.
            </p>
          </CardHeader>
          <CardContent>
            <BranchExpenseChart points={branchPoints} categories={chartCategories} />
          </CardContent>
        </Card>
      )}

      {trendPoints.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xu hướng 12 tháng</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tổng chi phí theo tháng — phát hiện tháng đột biến.
            </p>
          </CardHeader>
          <CardContent>
            <ExpenseTrendChart points={trendPoints} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Chi tiết {data.range.label} ({allPeriodRows.length} khoản)
          </CardTitle>
          {recurringPeriodRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Gồm {recurringPeriodRows.length} khoản định kỳ tự ghi — sửa/xoá khoản định kỳ là áp
              dụng cho MỌI kỳ của nó.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="expense_date" label="Ngày" />
                <TableHead>Chi nhánh</TableHead>
                <TableHead>Hạng mục</TableHead>
                <TableHead>Ghi chú</TableHead>
                <SortableTableHead sortKey="amount" label="Số tiền" align="right" />
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {dateFormatter.format(new Date(row.expense_date))}
                  </TableCell>
                  <TableCell>
                    <BranchBadge name={branchNameById.get(row.branch_id) ?? "—"} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{
                          backgroundColor: categoryColor(categoryIndexById.get(row.category_id) ?? 0),
                        }}
                      />
                      {categoryNameById.get(row.category_id) ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {isRecurringRow(row) && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                          Định kỳ
                        </span>
                      )}
                      <span className="truncate">{row.note ?? "—"}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(Number(row.amount))}đ
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      {isRecurringRow(row) ? (
                        <>
                          <RecurringExpenseDialog
                            branches={branchList}
                            categories={data.categories}
                            lockedBranchId={isBranchManager ? employee.branch_id : undefined}
                            recurring={recurringById.get(row.recurringId)}
                          />
                          <ConfirmDeleteButton
                            confirmMessage="Xoá chi phí định kỳ này? MỌI kỳ (các tháng) của nó sẽ biến mất — nếu chỉ muốn dừng từ nay về sau, hãy đặt ngày kết thúc."
                            successMessage="Đã xoá chi phí định kỳ."
                            action={deleteRecurringExpense}
                            actionArg={row.recurringId}
                          />
                        </>
                      ) : (
                        <>
                          <ExpenseDialog
                            branches={branchList}
                            categories={data.categories}
                            lockedBranchId={isBranchManager ? employee.branch_id : undefined}
                            expense={{
                              id: row.id,
                              branch_id: row.branch_id,
                              category_id: row.category_id,
                              amount: Number(row.amount),
                              expense_date: row.expense_date,
                              note: row.note,
                            }}
                          />
                          <ConfirmDeleteButton
                            confirmMessage="Xoá khoản chi này?"
                            successMessage="Đã xoá khoản chi."
                            action={deleteExpense}
                            actionArg={row.id}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!sortedRows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Chưa có khoản chi nào trong {data.range.label} — bấm &quot;Thêm khoản chi&quot;
                    hoặc &quot;Chép từ tháng trước&quot;.
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
