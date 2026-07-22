import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueBarList } from "@/components/revenue-bar-list";
import { PeriodPicker } from "@/components/period-picker";
import { formatDayLabel } from "@/components/dashboard-cards";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { revenueForDay, revenueForMonth, revenueForYear, todayParts } from "@/lib/dashboard-reports";

const VIEW_ROLES = ["admin", "ke_toan"] as const;
const currencyFormatter = new Intl.NumberFormat("vi-VN");

function formatPercentShare(value: number, total: number) {
  if (total <= 0) return "—";
  return `${((value / total) * 100).toFixed(0)}%`;
}

export default async function BranchCompareReportPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; month?: string; year?: string }>;
}) {
  await requireRole([...VIEW_ROLES]);

  const params = await searchParams;
  const defaults = todayParts();
  const day = params.day || defaults.day;
  const month = params.month || defaults.month;
  const year = params.year || defaults.year;

  const supabase = await createClient();
  const [{ data: branches }, { data: orders }] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("orders").select("branch_id, order_date, total_value"),
  ]);

  const branchList = branches ?? [];
  const orderList = orders ?? [];

  const rows = branchList.map((branch) => {
    const branchOrders = orderList.filter((o) => o.branch_id === branch.id);
    return {
      branch,
      day: revenueForDay(branchOrders, day),
      month: revenueForMonth(branchOrders, month),
      year: revenueForYear(branchOrders, year),
    };
  });

  const totals = {
    day: rows.reduce((sum, r) => sum + r.day, 0),
    month: rows.reduce((sum, r) => sum + r.month, 0),
    year: rows.reduce((sum, r) => sum + r.year, 0),
  };

  const dayPoints = [...rows]
    .sort((a, b) => b.day - a.day)
    .map((r) => ({ label: r.branch.name, value: r.day }));
  const monthPoints = [...rows]
    .sort((a, b) => b.month - a.month)
    .map((r) => ({ label: r.branch.name, value: r.month }));
  const yearPoints = [...rows]
    .sort((a, b) => b.year - a.year)
    .map((r) => ({ label: r.branch.name, value: r.year }));

  const isToday = day === defaults.day;
  const isThisMonth = month === defaults.month;
  const isThisYear = year === defaults.year;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">So sánh chi nhánh</h1>
        <p className="text-sm text-muted-foreground">
          Tương quan doanh số giữa các chi nhánh theo ngày/tháng/năm bất kì.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isToday ? "Doanh thu hôm nay" : `Doanh thu ngày ${formatDayLabel(day)}`}
            </CardTitle>
            <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />
          </CardHeader>
          <CardContent className="space-y-3">
            <RevenueBarList points={dayPoints} labelWidthClassName="w-24" />
            <p className="text-xs text-muted-foreground">
              Tổng 3 chi nhánh: {currencyFormatter.format(totals.day)}đ
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isThisMonth
                ? "Doanh thu tháng này"
                : `Doanh thu tháng ${month.split("-")[1]}/${month.split("-")[0]}`}
            </CardTitle>
            <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          </CardHeader>
          <CardContent className="space-y-3">
            <RevenueBarList points={monthPoints} labelWidthClassName="w-24" />
            <p className="text-xs text-muted-foreground">
              Tổng 3 chi nhánh: {currencyFormatter.format(totals.month)}đ
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isThisYear ? "Doanh thu năm nay" : `Doanh thu năm ${year}`}
            </CardTitle>
            <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
          </CardHeader>
          <CardContent className="space-y-3">
            <RevenueBarList points={yearPoints} labelWidthClassName="w-24" />
            <p className="text-xs text-muted-foreground">
              Tổng 3 chi nhánh: {currencyFormatter.format(totals.year)}đ
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bảng số liệu chi tiết</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chi nhánh</TableHead>
                <TableHead>Hôm nay</TableHead>
                <TableHead>Tháng này</TableHead>
                <TableHead>Năm nay</TableHead>
                <TableHead>% đóng góp doanh thu năm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.branch.id}>
                  <TableCell className="font-medium">{r.branch.name}</TableCell>
                  <TableCell>{currencyFormatter.format(r.day)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(r.month)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(r.year)}đ</TableCell>
                  <TableCell>{formatPercentShare(r.year, totals.year)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Chưa có chi nhánh nào.
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="font-medium">
                <TableCell>Tổng cộng</TableCell>
                <TableCell>{currencyFormatter.format(totals.day)}đ</TableCell>
                <TableCell>{currencyFormatter.format(totals.month)}đ</TableCell>
                <TableCell>{currencyFormatter.format(totals.year)}đ</TableCell>
                <TableCell>100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
