import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchComparisonCard } from "@/components/branch-comparison-card";
import { PeriodPicker } from "@/components/period-picker";
import { BranchBadge } from "@/components/branch-badge";
import { revenueForDay, revenueForMonth, revenueForYear } from "@/lib/dashboard-reports";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

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
  // colorIndex theo vị trí trong danh sách chi nhánh (đã sắp theo tên, ổn
  // định) — màu bám chi nhánh, không bám thứ hạng doanh thu.
  const rows = branches.map((branch, i) => {
    const branchOrders = orders.filter((o) => o.pickup_branch_id === branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      colorIndex: i % 10,
      day: revenueForDay(branchOrders, day),
      month: revenueForMonth(branchOrders, month),
      year: revenueForYear(branchOrders, year),
    };
  });

  return (
    <div className="space-y-4">
      <BranchComparisonCard
        rows={rows}
        day={day}
        month={month}
        year={year}
        isToday={isToday}
        isThisMonth={isThisMonth}
        isThisYear={isThisYear}
      />

      {profit && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {isThisMonth
                  ? "Lãi gộp tháng này theo chi nhánh"
                  : `Lãi gộp tháng ${month.split("-")[1]}/${month.split("-")[0]} theo chi nhánh`}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Lãi = doanh thu (chưa VAT) − chi phí vận hành − quỹ lương tự tính từ Bảng lương.
              </p>
            </div>
            {/* Đổi tháng ở đây đổi luôn kỳ "tháng" của ô so sánh phía trên —
                cùng 1 param, hai khối luôn kể chuyện của cùng 1 tháng. */}
            <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
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
                      const operating = profit.operatingByBranch.get(r.branchId) ?? 0;
                      const payroll = profit.payrollByBranch.get(r.branchId) ?? 0;
                      return {
                        branchId: r.branchId,
                        branchName: r.branchName,
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
                        <TableRow key={r.branchId}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <BranchBadge name={r.branchName} />
                              {r.branchName}
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
    </div>
  );
}
