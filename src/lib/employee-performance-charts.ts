import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  computeOrderCommissionFund,
  computeTaskCommission,
  findBonusAmount,
  findCommissionRate,
  findTaskWeight,
} from "@/lib/commission";
import type { TaskType } from "@/types/database";

// Admin/Kế toán — 2 role duy nhất được xem lương/khoán của người khác (Bảng
// lương + khối biểu đồ hiệu suất nhân viên ở Trang chủ).
export const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const start = `${month}-01`;
  const nextMonth =
    monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
  return { start, end: `${nextMonth}-01` };
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export interface EmployeeMonthlyPerformance {
  id: string;
  name: string;
  baseSalary: number;
  totalCommission: number;
  bonus: number;
  totalIncome: number;
  completedTaskCount: number;
  taskTypeCounts: Partial<Record<TaskType, number>>;
}

// Dùng chung cho Bảng lương và khối biểu đồ hiệu suất nhân viên ở Trang chủ —
// 1 lần fetch/tính cho cả tháng, giữ lại luôn taskTypeCounts (đếm theo từng
// khâu) thay vì chỉ cộng dồn thành 1 số như trước. Dùng service-role vì cần
// đọc commission_tiers/task_weights/bonus_tiers (RLS chặn nhân viên thường) —
// giới hạn phạm vi nhân viên qua `options.employeeIds` ở tầng gọi theo role.
export async function computeEmployeeMonthlyPerformance(
  month: string,
  options?: { employeeIds?: string[] },
): Promise<EmployeeMonthlyPerformance[]> {
  const { start, end } = getMonthRange(month);
  const admin = createAdminClient();

  let employeesQuery = admin
    .from("employees")
    .select("id, name, base_salary, branch_id, is_active")
    .eq("is_active", true)
    .order("name");
  if (options?.employeeIds) {
    employeesQuery = employeesQuery.in("id", options.employeeIds);
  }

  const [{ data: employees }, tasksInMonth, { data: commissionTiers }, { data: taskWeights }, { data: bonusTiers }] =
    await Promise.all([
      employeesQuery,
      fetchAllRows<{ task_type: TaskType; employee_id: string | null; completed_date: string; order_id: string }>(
        (from, to) =>
          admin
            .from("order_tasks")
            .select("task_type, employee_id, completed_date, order_id")
            .not("completed_date", "is", null)
            .gte("completed_date", start)
            .lt("completed_date", end)
            .range(from, to),
      ),
      admin.from("commission_tiers").select("branch_id, min_value, max_value, percentage"),
      admin.from("task_weights").select("task_type, weight_percentage"),
      admin.from("bonus_tiers").select("branch_id, threshold_amount, bonus_amount"),
    ]);

  const employeeList = employees ?? [];

  // Không lọc orders bằng .in(id, orderIds) — 1 tháng bận có thể liên quan
  // hàng nghìn đơn, danh sách IN dài cỡ đó dễ vượt giới hạn độ dài URL của
  // PostgREST. Lấy toàn bộ orders (phân trang) rồi tra bằng Map.
  const allOrders = await fetchAllRows<{ id: string; total_value: number; pickup_branch_id: string }>(
    (from, to) => admin.from("orders").select("id, total_value, pickup_branch_id").range(from, to),
  );
  const orderById = new Map(allOrders.map((o) => [o.id, o]));

  return employeeList.map((emp) => {
    const empTasks = tasksInMonth.filter((t) => t.employee_id === emp.id);
    const taskTypeCounts: Partial<Record<TaskType, number>> = {};
    const totalCommission = empTasks.reduce((sum, t) => {
      taskTypeCounts[t.task_type] = (taskTypeCounts[t.task_type] ?? 0) + 1;
      const order = orderById.get(t.order_id);
      if (!order) return sum;
      const rate = findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, order.total_value);
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
      completedTaskCount: empTasks.length,
      taskTypeCounts,
    };
  });
}
