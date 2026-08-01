import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchComparisonCard } from "@/components/branch-comparison-card";
import { BranchProfitChart } from "@/components/branch-profit-chart";
import { PeriodPicker } from "@/components/period-picker";
import { ProfitPeriodTabs } from "@/components/profit-period-tabs";
import type { ProfitPeriod } from "@/lib/profit-period";
import { revenueForDay, revenueForMonth, revenueForYear } from "@/lib/dashboard-reports";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// "2026-08" → "2026-07"; "2026-01" → "2025-12".
export function previousMonthOf(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function BranchComparisonSection({
  branches,
  orders,
  day,
  month,
  year,
  profit,
  profitPeriod = "month",
}: {
  branches: { id: string; name: string }[];
  // Doanh thu ghi nhận theo chi nhánh giao (chi nhánh "sở hữu" đơn).
  orders: { pickup_branch_id: string; order_date: string; total_value: number }[];
  day: string;
  month: string;
  year: string;
  // Chi phí vận hành + quỹ lương của KỲ lợi nhuận đang chọn, gom sẵn theo
  // chi nhánh — có thì hiện thêm khối Lợi nhuận gộp.
  profit?: {
    operatingByBranch: Map<string, number>;
    payrollByBranch: Map<string, number>;
  };
  profitPeriod?: ProfitPeriod;
}) {
  // Tuần Thứ 2 → CN chứa ngày đang chọn (cùng quy ước tuần với trang /orders).
  const dayDate = new Date(day);
  const weekStartDate = new Date(dayDate);
  weekStartDate.setDate(dayDate.getDate() + (dayDate.getDay() === 0 ? -6 : 1 - dayDate.getDay()));
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  // colorIndex theo vị trí trong danh sách chi nhánh (đã sắp theo tên, ổn
  // định) — màu bám chi nhánh, không bám thứ hạng doanh thu.
  const rows = branches.map((branch, i) => {
    const branchOrders = orders.filter((o) => o.pickup_branch_id === branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      colorIndex: i % 10,
      day: revenueForDay(branchOrders, day),
      week: branchOrders
        .filter((o) => o.order_date >= weekStart && o.order_date <= weekEnd)
        .reduce((sum, o) => sum + o.total_value, 0),
      month: revenueForMonth(branchOrders, month),
      prevMonth: revenueForMonth(branchOrders, previousMonthOf(month)),
      year: revenueForYear(branchOrders, year),
      prevYear: revenueForYear(branchOrders, String(Number(year) - 1)),
    };
  });

  // Doanh thu vế lợi nhuận đi theo đúng kỳ đang chọn ở cụm nút.
  const profitRevenueKey = profitPeriod;
  // Chi nhánh không phát sinh gì cả (HQ chỉ có lương thì VẪN phát sinh) mới
  // ẩn khỏi biểu đồ lợi nhuận.
  const profitRows = profit
    ? rows
        .map((r) => {
          const operating = profit.operatingByBranch.get(r.branchId) ?? 0;
          const payroll = profit.payrollByBranch.get(r.branchId) ?? 0;
          const revenue = r[profitRevenueKey];
          return {
            name: r.branchName,
            revenue,
            operating,
            payroll,
            net: revenue - operating - payroll,
          };
        })
        .filter((r) => r.revenue !== 0 || r.operating !== 0 || r.payroll !== 0)
        .sort((a, b) => b.net - a.net)
    : null;
  const totalNet = profitRows ? profitRows.reduce((sum, r) => sum + r.net, 0) : 0;

  return (
    <div className="space-y-4">
      <BranchComparisonCard rows={rows} day={day} month={month} year={year} />

      {profitRows && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            {/* Công thức cất vào icon ⓘ (CEO chốt) — rê chuột mới hiện. */}
            <CardTitle className="flex items-center gap-1.5 text-base">
              Lợi nhuận gộp
              <span
                title="Lãi = doanh thu (chưa VAT) − chi phí vận hành − quỹ lương tự tính từ Bảng lương."
                className="cursor-help text-muted-foreground"
              >
                <Info className="size-4" />
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <ProfitPeriodTabs value={profitPeriod} />
              {/* Ô chọn dùng chung param với card Doanh thu — hai khối luôn kể
                  chuyện của cùng 1 tháng/năm. */}
              {(profitPeriod === "month" || profitPeriod === "prevMonth") && (
                <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
              )}
              {(profitPeriod === "year" || profitPeriod === "prevYear") && (
                <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!profitRows.length ? (
              <p className="text-sm text-muted-foreground">
                Kỳ này chưa có doanh thu, chi phí hay lương nào.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Tổng lợi nhuận gộp</p>
                  <p
                    className={`text-2xl font-semibold tabular-nums ${
                      totalNet < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {currencyFormatter.format(totalNet)}đ
                  </p>
                </div>
                <BranchProfitChart rows={profitRows} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
