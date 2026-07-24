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
import { revenueForDay, revenueForMonth, revenueForYear } from "@/lib/dashboard-reports";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function formatPercentShare(value: number, total: number) {
  if (total <= 0) return "—";
  return `${((value / total) * 100).toFixed(0)}%`;
}

export function BranchComparisonSection({
  branches,
  orders,
  day,
  month,
  year,
  isToday,
  isThisMonth,
  isThisYear,
}: {
  branches: { id: string; name: string }[];
  // Doanh thu ghi nhận theo chi nhánh giao (chi nhánh "sở hữu" đơn).
  orders: { pickup_branch_id: string; order_date: string; total_value: number }[];
  day: string;
  month: string;
  year: string;
  isToday: boolean;
  isThisMonth: boolean;
  isThisYear: boolean;
}) {
  const rows = branches.map((branch) => {
    const branchOrders = orders.filter((o) => o.pickup_branch_id === branch.id);
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

  const dayPoints = [...rows].sort((a, b) => b.day - a.day).map((r) => ({ label: r.branch.name, value: r.day }));
  const monthPoints = [...rows]
    .sort((a, b) => b.month - a.month)
    .map((r) => ({ label: r.branch.name, value: r.month }));
  const yearPoints = [...rows].sort((a, b) => b.year - a.year).map((r) => ({ label: r.branch.name, value: r.year }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">So sánh chi nhánh</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isToday ? "Doanh thu hôm nay" : `Doanh thu ngày ${formatDayLabel(day)}`}
            </CardTitle>
            <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold">{currencyFormatter.format(totals.day)}đ</p>
            <RevenueBarList points={dayPoints} labelWidthClassName="w-24" />
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
            <p className="text-3xl font-semibold">{currencyFormatter.format(totals.month)}đ</p>
            <RevenueBarList points={monthPoints} labelWidthClassName="w-24" />
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
            <p className="text-3xl font-semibold">{currencyFormatter.format(totals.year)}đ</p>
            <RevenueBarList points={yearPoints} labelWidthClassName="w-24" />
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
