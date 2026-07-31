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
import { BranchBadge } from "@/components/branch-badge";
import { revenueForDay, revenueForMonth, revenueForYear } from "@/lib/dashboard-reports";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

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
  profit,
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
  // Chi phí vận hành + quỹ lương của THÁNG đang chọn, gom sẵn theo chi nhánh
  // — có thì hiện thêm khối Lãi gộp (doanh thu tháng − 2 khoản này).
  profit?: {
    operatingByBranch: Map<string, number>;
    payrollByBranch: Map<string, number>;
  };
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

      {profit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isThisMonth
                ? "Lãi gộp tháng này theo chi nhánh"
                : `Lãi gộp tháng ${month.split("-")[1]}/${month.split("-")[0]} theo chi nhánh`}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Lãi = doanh thu (chưa VAT) − chi phí vận hành − quỹ lương tự tính từ Bảng lương.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chi nhánh</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Chi phí vận hành</TableHead>
                  <TableHead className="text-right">Quỹ lương</TableHead>
                  <TableHead className="text-right">Lãi gộp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const profitRows = rows
                    .map((r) => {
                      const operating = profit.operatingByBranch.get(r.branch.id) ?? 0;
                      const payroll = profit.payrollByBranch.get(r.branch.id) ?? 0;
                      return {
                        branch: r.branch,
                        revenue: r.month,
                        operating,
                        payroll,
                        net: r.month - operating - payroll,
                      };
                    })
                    // Chi nhánh không phát sinh gì cả (HQ chỉ có lương thì
                    // VẪN phát sinh) mới ẩn khỏi bảng.
                    .filter((r) => r.revenue !== 0 || r.operating !== 0 || r.payroll !== 0)
                    .sort((a, b) => b.net - a.net);
                  const sum = profitRows.reduce(
                    (acc, r) => ({
                      revenue: acc.revenue + r.revenue,
                      operating: acc.operating + r.operating,
                      payroll: acc.payroll + r.payroll,
                      net: acc.net + r.net,
                    }),
                    { revenue: 0, operating: 0, payroll: 0, net: 0 },
                  );
                  return (
                    <>
                      {profitRows.map((r) => (
                        <TableRow key={r.branch.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <BranchBadge name={r.branch.name} />
                              {r.branch.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(r.revenue)}đ
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(r.operating)}đ
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(r.payroll)}đ
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${
                              r.net < 0 ? "text-destructive" : ""
                            }`}
                          >
                            {currencyFormatter.format(r.net)}đ
                          </TableCell>
                        </TableRow>
                      ))}
                      {!profitRows.length && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Tháng này chưa có doanh thu, chi phí hay lương nào.
                          </TableCell>
                        </TableRow>
                      )}
                      {profitRows.length > 0 && (
                        <TableRow className="font-medium">
                          <TableCell>Tổng cộng</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(sum.revenue)}đ
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(sum.operating)}đ
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currencyFormatter.format(sum.payroll)}đ
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${sum.net < 0 ? "text-destructive" : ""}`}
                          >
                            {currencyFormatter.format(sum.net)}đ
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <BranchBadge name={r.branch.name} />
                      {r.branch.name}
                    </div>
                  </TableCell>
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
