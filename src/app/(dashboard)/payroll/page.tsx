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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeOrderCommissionFund,
  computeTaskCommission,
  findBonusAmount,
  findCommissionRate,
  findTaskWeight,
} from "@/lib/commission";
import { MonthPicker } from "./month-picker";

const MANAGE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");

function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const start = `${month}-01`;
  const nextMonth =
    monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
  return { start, end: `${nextMonth}-01` };
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();
  const { start, end } = getMonthRange(month);

  const viewer = await getCurrentEmployee();
  if (!viewer) return null;

  const canViewAll = MANAGE_ROLES.includes(viewer.role);

  // Dùng service-role client vì tính khoán cần đọc commission_tiers/task_weights
  // (bị RLS chặn với nhân viên thường) — nhưng chỉ trả về đúng phạm vi nhân
  // viên được xem theo role ở tầng code, không lộ dữ liệu người khác.
  const admin = createAdminClient();

  const employeesQuery = admin
    .from("employees")
    .select("id, name, base_salary, branch_id, is_active")
    .eq("is_active", true)
    .order("name");
  if (!canViewAll) {
    employeesQuery.eq("id", viewer.id);
  }

  const [{ data: employees }, { data: doneTasks }, { data: commissionTiers }, { data: taskWeights }, { data: bonusTiers }] =
    await Promise.all([
      employeesQuery,
      admin
        .from("order_tasks")
        .select("task_type, employee_id, completed_date, order_id")
        .not("completed_date", "is", null)
        .gte("completed_date", start)
        .lt("completed_date", end),
      admin.from("commission_tiers").select("branch_id, min_value, max_value, percentage"),
      admin.from("task_weights").select("task_type, weight_percentage"),
      admin.from("bonus_tiers").select("branch_id, threshold_amount, bonus_amount"),
    ]);

  const employeeList = employees ?? [];
  const tasksInMonth = doneTasks ?? [];
  const orderIds = [...new Set(tasksInMonth.map((t) => t.order_id))];

  const { data: orders } = orderIds.length
    ? await admin.from("orders").select("id, total_value, branch_id").in("id", orderIds)
    : { data: [] };
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const rows = employeeList.map((emp) => {
    const empTasks = tasksInMonth.filter((t) => t.employee_id === emp.id);
    const totalCommission = empTasks.reduce((sum, t) => {
      const order = orderById.get(t.order_id);
      if (!order) return sum;
      const rate = findCommissionRate(commissionTiers ?? [], order.branch_id, order.total_value);
      const fund = computeOrderCommissionFund(order.total_value, rate);
      const weight = findTaskWeight(taskWeights ?? [], t.task_type);
      return sum + computeTaskCommission(fund, weight);
    }, 0);
    const bonus = emp.branch_id
      ? findBonusAmount(bonusTiers ?? [], emp.branch_id, totalCommission)
      : 0;
    return {
      id: emp.id,
      name: emp.name,
      baseSalary: emp.base_salary,
      totalCommission,
      bonus,
      totalIncome: emp.base_salary + totalCommission + bonus,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bảng lương tháng</h1>
        <MonthPicker key={month} month={month} />
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
                  <TableCell>{currencyFormatter.format(row.bonus)}đ</TableCell>
                  <TableCell className="font-medium">
                    {currencyFormatter.format(row.totalIncome)}đ
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
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
