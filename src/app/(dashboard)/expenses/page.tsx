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
import {
  fetchExpenseData,
  sumAmount,
  type ExpensePeriod,
  type ExpenseRow,
} from "@/lib/expense-reports";
import { currentMonth } from "@/lib/employee-performance-charts";
import {
  BranchExpenseChart,
  ExpenseTrendChart,
  categoryColor,
  type BranchExpensePoint,
  type ExpenseTrendPoint,
} from "./expense-charts";
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

  const supabase = await createClient();
  const [{ data: branches }, data] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    fetchExpenseData(period, month),
  ]);
  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const categoryNameById = new Map(data.categories.map((c) => [c.id, c.name]));
  const categoryIndexById = new Map(data.categories.map((c, i) => [c.id, i]));

  const total = sumAmount(data.periodRows);
  const prevTotal = sumAmount(data.previousPeriodRows);
  const deltaPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  // Kho tốn nhất + hạng mục lớn nhất trong kỳ.
  const byBranch = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const r of data.periodRows) {
    byBranch.set(r.branch_id, (byBranch.get(r.branch_id) ?? 0) + Number(r.amount));
    byCategory.set(r.category_id, (byCategory.get(r.category_id) ?? 0) + Number(r.amount));
  }
  const topBranch = [...byBranch.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  // Điểm cho biểu đồ cột chồng theo chi nhánh — chỉ chi nhánh có phát sinh.
  const branchPoints: BranchExpensePoint[] = [...byBranch.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([branchId]) => {
      const point: BranchExpensePoint = {
        branch: branchNameById.get(branchId) ?? "—",
      };
      for (const c of data.categories) point[c.id] = 0;
      for (const r of data.periodRows) {
        if (r.branch_id === branchId) {
          point[r.category_id] = (Number(point[r.category_id]) || 0) + Number(r.amount);
        }
      }
      return point;
    });

  // Xu hướng 12 tháng (tổng mọi hạng mục).
  const trendByMonth = new Map<string, number>();
  for (const r of data.trendRows) {
    const key = r.expense_date.slice(0, 7);
    trendByMonth.set(key, (trendByMonth.get(key) ?? 0) + Number(r.amount));
  }
  const trendPoints: ExpenseTrendPoint[] = [...trendByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, t]) => ({ month: m, total: t }));

  const sortedRows: ExpenseRow[] = [...data.periodRows].sort((a, b) => {
    const dirMult = activeDir === "asc" ? 1 : -1;
    if (activeSort === "amount") return dirMult * (Number(a.amount) - Number(b.amount));
    // mặc định + sort theo ngày
    return dirMult * a.expense_date.localeCompare(b.expense_date);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Chi phí vận hành</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExpensePeriodFilter value={period} />
          <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          {period === "month" && <CopyLastMonthButton month={month} />}
          <ExpenseDialog
            branches={branchList}
            categories={data.categories}
            lockedBranchId={isBranchManager ? employee.branch_id : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Tổng chi ${data.range.label}${isBranchManager ? ` — kho ${branchNameById.get(employee.branch_id ?? "") ?? ""}` : ""}`}
          value={`${currencyFormatter.format(total)}đ`}
        >
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
        </StatCard>

        <StatCard label="Số khoản chi trong kỳ" value={data.periodRows.length} />

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
              Tổng chi {data.range.label} của từng chi nhánh, tách theo hạng mục.
            </p>
          </CardHeader>
          <CardContent>
            <BranchExpenseChart points={branchPoints} categories={data.categories} />
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
            Chi tiết {data.range.label} ({data.periodRows.length} khoản)
          </CardTitle>
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
                    {row.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(Number(row.amount))}đ
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
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
