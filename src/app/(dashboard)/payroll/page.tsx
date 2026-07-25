import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentEmployee } from "@/lib/dal";
import {
  computeEmployeeMonthlyPerformance,
  currentMonth,
  MANAGE_ROLES,
} from "@/lib/employee-performance-charts";
import { MonthNavigator } from "./month-navigator";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

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

  const rows = await computeEmployeeMonthlyPerformance(
    month,
    canViewAll ? undefined : { employeeIds: [viewer.id] },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bảng lương tháng</h1>
        <MonthNavigator month={month} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tháng {month}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhân viên</TableHead>
                <TableHead>Lương cứng</TableHead>
                <TableHead>Tổng khoán</TableHead>
                <TableHead>Phí dịch vụ</TableHead>
                <TableHead>OT</TableHead>
                <TableHead>Thưởng</TableHead>
                <TableHead>Tổng thu nhập</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{currencyFormatter.format(row.baseSalary)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(row.totalCommission)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(row.servicePayout)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(row.overtimePay)}đ</TableCell>
                  <TableCell>{currencyFormatter.format(row.bonus)}đ</TableCell>
                  <TableCell className="font-medium">
                    {currencyFormatter.format(row.totalIncome)}đ
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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
