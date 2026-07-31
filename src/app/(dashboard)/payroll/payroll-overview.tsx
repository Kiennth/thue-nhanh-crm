import { TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { EmployeeIncomeCompositionChart } from "../employee-performance-charts";
import { BranchPayrollChart, type BranchPayrollPoint } from "./branch-payroll-chart";
import type { EmployeeMonthlyPerformance } from "@/lib/employee-performance-charts";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function sumIncome(rows: EmployeeMonthlyPerformance[]) {
  return rows.reduce((sum, r) => sum + r.totalIncome, 0);
}

// Tổng quan quỹ lương tháng: 4 con số chốt ở trên, rồi biểu đồ cơ cấu thu
// nhập từng người (cột chồng ngang) — nhìn phát biết ai ăn khoán nhiều, ai
// chủ yếu lương cứng, mà không phải dò 12 cột số trong bảng bên dưới.
export function PayrollOverview({
  rows,
  prevRows,
  month,
  branchName,
  branchNameById,
}: {
  rows: EmployeeMonthlyPerformance[];
  prevRows: EmployeeMonthlyPerformance[];
  month: string;
  // Có giá trị khi người xem bị giới hạn theo chi nhánh (Cửa hàng trưởng) —
  // ghi thẳng tên kho vào nhãn để không hiểu nhầm là số toàn công ty.
  branchName?: string;
  // Chỉ cần khi xem toàn công ty, để tách quỹ lương theo từng chi nhánh.
  branchNameById?: Map<string, string>;
}) {
  if (!rows.length) return null;

  const total = sumIncome(rows);
  const prevTotal = sumIncome(prevRows);
  const deltaPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const headcount = rows.length;
  const avg = headcount > 0 ? total / headcount : 0;

  // Phần "biến đổi" = tất cả trừ lương cứng (khoán + phí dịch vụ + OT +
  // thưởng) — tỉ trọng này cho biết quỹ lương đang gắn với sản lượng bao nhiêu.
  const baseTotal = rows.reduce((sum, r) => sum + r.baseSalary, 0);
  const variablePct = total > 0 ? ((total - baseTotal) / total) * 100 : 0;

  const scopeLabel = branchName ? `kho ${branchName}` : "toàn công ty";

  // Xem toàn công ty: gom quỹ lương theo chi nhánh để thấy nơi nào tốn nhất.
  // Cửa hàng trưởng chỉ có 1 chi nhánh nên khối này tự ẩn.
  const branchPoints: BranchPayrollPoint[] = (() => {
    if (branchName || !branchNameById) return [];
    const byBranch = new Map<string, { total: number; headcount: number }>();
    for (const row of rows) {
      const label = (row.branchId ? branchNameById.get(row.branchId) : undefined) ?? "Chưa gán";
      const cur = byBranch.get(label) ?? { total: 0, headcount: 0 };
      byBranch.set(label, {
        total: cur.total + row.totalIncome,
        headcount: cur.headcount + 1,
      });
    }
    return [...byBranch.entries()]
      .map(([branch, v]) => ({ branch, ...v }))
      .sort((a, b) => b.total - a.total);
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Tổng quỹ lương — ${scopeLabel}`}
          value={`${currencyFormatter.format(total)}đ`}
        >
          {deltaPct !== null && (
            <p
              className={`flex items-center gap-1 text-xs ${
                deltaPct >= 0 ? "text-destructive" : "text-primary"
              }`}
            >
              {deltaPct >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {deltaPct >= 0 ? "+" : ""}
              {deltaPct.toFixed(1)}% so với tháng trước
            </p>
          )}
        </StatCard>

        <StatCard label="Số nhân viên tính lương" value={headcount}>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            {branchName ? `Thuộc ${branchName}` : "Toàn công ty"} · tháng {month}
          </p>
        </StatCard>

        <StatCard label="Trung bình / người" value={`${currencyFormatter.format(avg)}đ`}>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="size-3.5" />
            Gồm lương cứng + khoán + thưởng
          </p>
        </StatCard>

        <StatCard label="Tỉ trọng lương theo sản lượng" value={`${variablePct.toFixed(0)}%`}>
          <p className="text-xs text-muted-foreground">
            Phần khoán/thưởng/OT ngoài lương cứng
          </p>
        </StatCard>
      </div>

      {branchPoints.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quỹ lương theo chi nhánh</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tổng chi lương tháng {month} của từng chi nhánh — di chuột để xem kèm số nhân viên.
            </p>
          </CardHeader>
          <CardContent>
            <BranchPayrollChart points={branchPoints} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cơ cấu thu nhập theo nhân viên</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mỗi thanh là 1 người — các mảng màu là từng hạng mục cấu thành thu nhập. Di chuột để
            xem số chi tiết; bảng đầy đủ ở ngay dưới.
          </p>
        </CardHeader>
        <CardContent>
          <EmployeeIncomeCompositionChart rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
