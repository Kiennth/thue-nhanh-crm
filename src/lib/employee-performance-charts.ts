import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  computeLineDirectPayout,
  computeOrderCommissionFund,
  computeOrderPoolValue,
  computePoolExcludedTotal,
  computeTaskCommission,
  computeTransportPayoutPercentage,
  findBonusAmount,
  findCommissionRate,
  findTaskWeight,
  SERVICE_LINE_CATEGORY_BY_TYPE_ID,
  TRANSPORT_LINE_CATEGORY_BY_TYPE_ID,
  type PoolExcludedLineInput,
} from "@/lib/commission";
import type { DeliveryMethod, TaskType } from "@/types/database";
import { MANAGE_ROLES } from "@/lib/roles";

export { MANAGE_ROLES };

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
  branchId: string | null;
  baseSalary: number;
  totalCommission: number;
  bonus: number;
  // Khoán trực tiếp từ dòng dịch vụ (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ thuật) và phụ
  // cấp OT — cộng vào totalIncome nhưng KHÔNG tính vào cơ sở bậc thưởng
  // (findBonusAmount chỉ dùng totalCommission gốc).
  installationPayout: number;
  removalPayout: number;
  supportPayout: number;
  deliveryPayout: number;
  collectionPayout: number;
  overtimePay: number;
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
  options?: { employeeIds?: string[]; branchId?: string },
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
  if (options?.branchId) {
    employeesQuery = employeesQuery.eq("branch_id", options.branchId);
  }

  const [
    { data: employees },
    tasksInMonth,
    { data: commissionTiers },
    { data: taskWeights },
    { data: bonusTiers },
    { data: equipmentTypes },
    allOrderLines,
    overtimeInMonth,
  ] = await Promise.all([
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
    admin.from("equipment_types").select("id, payout_percentage"),
    fetchAllRows<{
      order_id: string;
      equipment_type_id: string | null;
      employee_id: string | null;
      completed_date: string | null;
      line_total: number;
      delivery_method: DeliveryMethod | null;
    }>((from, to) =>
      admin
        .from("order_equipment")
        .select("order_id, equipment_type_id, employee_id, completed_date, line_total, delivery_method")
        .range(from, to),
    ),
    fetchAllRows<{ employee_id: string; amount: number }>((from, to) =>
      admin
        .from("overtime_entries")
        .select("employee_id, amount")
        .gte("entry_date", start)
        .lt("entry_date", end)
        .range(from, to),
    ),
  ]);

  const employeeList = employees ?? [];

  // Không lọc orders bằng .in(id, orderIds) — 1 tháng bận có thể liên quan
  // hàng nghìn đơn, danh sách IN dài cỡ đó dễ vượt giới hạn độ dài URL của
  // PostgREST. Lấy toàn bộ orders (phân trang) rồi tra bằng Map.
  const allOrders = await fetchAllRows<{
    id: string;
    total_value: number;
    pickup_branch_id: string;
    rental_start_at: string | null;
    rental_end_at: string | null;
  }>((from, to) =>
    admin
      .from("orders")
      .select("id, total_value, pickup_branch_id, rental_start_at, rental_end_at")
      .range(from, to),
  );
  const orderById = new Map(allOrders.map((o) => [o.id, o]));

  // Dòng dịch vụ trả khoán trực tiếp (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ thuật...) —
  // loại khỏi quỹ khoán theo khâu của CẢ đơn (không giới hạn theo tháng, vì
  // đây là thuộc tính cố định của đơn), và tính riêng phần trả trực tiếp
  // trong tháng cho người thực hiện.
  const payoutPercentByTypeId = new Map(
    (equipmentTypes ?? [])
      .filter((t): t is { id: string; payout_percentage: number } => t.payout_percentage != null)
      .map((t) => [t.id, t.payout_percentage]),
  );
  const directPayoutTypeIds = new Set([
    ...payoutPercentByTypeId.keys(),
    ...Object.keys(TRANSPORT_LINE_CATEGORY_BY_TYPE_ID),
  ]);
  const linesByOrderId = new Map<string, PoolExcludedLineInput[]>();
  for (const line of allOrderLines) {
    const list = linesByOrderId.get(line.order_id) ?? [];
    list.push(line);
    linesByOrderId.set(line.order_id, list);
  }
  const poolExclusionByOrderId = new Map(
    [...linesByOrderId.entries()].map(([orderId, lines]) => [
      orderId,
      computePoolExcludedTotal(lines, directPayoutTypeIds),
    ]),
  );

  const servicePayoutByEmployeeId = new Map<
    string,
    { installation: number; removal: number; support: number; delivery: number; collection: number }
  >();
  for (const line of allOrderLines) {
    if (!line.employee_id || !line.equipment_type_id || !line.completed_date) continue;
    if (line.completed_date < start || line.completed_date >= end) continue;

    const entry = servicePayoutByEmployeeId.get(line.employee_id) ?? {
      installation: 0,
      removal: 0,
      support: 0,
      delivery: 0,
      collection: 0,
    };

    const serviceCategory = SERVICE_LINE_CATEGORY_BY_TYPE_ID[line.equipment_type_id];
    if (serviceCategory) {
      const payoutPercentage = payoutPercentByTypeId.get(line.equipment_type_id);
      if (payoutPercentage != null) {
        entry[serviceCategory] += computeLineDirectPayout(line.line_total, payoutPercentage);
        servicePayoutByEmployeeId.set(line.employee_id, entry);
      }
      continue;
    }

    const transportCategory = TRANSPORT_LINE_CATEGORY_BY_TYPE_ID[line.equipment_type_id];
    if (transportCategory) {
      const order = orderById.get(line.order_id);
      const scheduledAt =
        transportCategory === "delivery" ? (order?.rental_start_at ?? null) : (order?.rental_end_at ?? null);
      const payoutPercentage = computeTransportPayoutPercentage(line.delivery_method, scheduledAt);
      entry[transportCategory] += computeLineDirectPayout(line.line_total, payoutPercentage);
      servicePayoutByEmployeeId.set(line.employee_id, entry);
    }
  }

  const overtimeByEmployeeId = new Map<string, number>();
  for (const entry of overtimeInMonth) {
    overtimeByEmployeeId.set(entry.employee_id, (overtimeByEmployeeId.get(entry.employee_id) ?? 0) + entry.amount);
  }

  return employeeList.map((emp) => {
    const empTasks = tasksInMonth.filter((t) => t.employee_id === emp.id);
    const taskTypeCounts: Partial<Record<TaskType, number>> = {};
    const totalCommission = empTasks.reduce((sum, t) => {
      taskTypeCounts[t.task_type] = (taskTypeCounts[t.task_type] ?? 0) + 1;
      const order = orderById.get(t.order_id);
      if (!order) return sum;
      const poolValue = computeOrderPoolValue(order.total_value, poolExclusionByOrderId.get(order.id) ?? 0);
      const rate = findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, poolValue);
      const fund = computeOrderCommissionFund(poolValue, rate);
      const weight = findTaskWeight(taskWeights ?? [], t.task_type);
      return sum + computeTaskCommission(fund, weight);
    }, 0);
    const bonus = emp.branch_id
      ? findBonusAmount(bonusTiers ?? [], emp.branch_id, totalCommission)
      : 0;
    const service = servicePayoutByEmployeeId.get(emp.id) ?? {
      installation: 0,
      removal: 0,
      support: 0,
      delivery: 0,
      collection: 0,
    };
    const overtimePay = overtimeByEmployeeId.get(emp.id) ?? 0;
    return {
      id: emp.id,
      name: emp.name,
      branchId: emp.branch_id,
      baseSalary: emp.base_salary,
      totalCommission,
      bonus,
      installationPayout: service.installation,
      removalPayout: service.removal,
      supportPayout: service.support,
      deliveryPayout: service.delivery,
      collectionPayout: service.collection,
      overtimePay,
      totalIncome:
        emp.base_salary +
        totalCommission +
        bonus +
        service.installation +
        service.removal +
        service.support +
        service.delivery +
        service.collection +
        overtimePay,
      completedTaskCount: empTasks.length,
      taskTypeCounts,
    };
  });
}

export interface MyMonthlyTrendPoint {
  month: string;
  baseSalary: number;
  totalCommission: number;
  bonus: number;
  installationPayout: number;
  removalPayout: number;
  supportPayout: number;
  deliveryPayout: number;
  collectionPayout: number;
  overtimePay: number;
  totalIncome: number;
  completedTaskCount: number;
  // Tháng hiện tại chưa chốt — biểu đồ hiển thị khác + chú thích để nhân
  // viên không hiểu nhầm là "tháng này tụt".
  inProgress: boolean;
}

// Thu nhập của 1 nhân viên qua N tháng gần nhất (mặc định 6, tính cả tháng
// đang chạy) — cho thẻ "Hiệu suất các tháng" ở Trang chủ của nhân viên, để
// tự thấy mình đi lên hay đi xuống. Chỉ trả dữ liệu của đúng employeeId.
export async function computeMyMonthlyTrend(
  employeeId: string,
  monthCount = 6,
): Promise<MyMonthlyTrendPoint[]> {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const thisMonth = currentMonth();

  const perMonth = await Promise.all(
    months.map((month) =>
      computeEmployeeMonthlyPerformance(month, { employeeIds: [employeeId] }),
    ),
  );

  return months.map((month, i) => {
    const row = perMonth[i][0];
    return {
      month,
      baseSalary: row?.baseSalary ?? 0,
      totalCommission: row?.totalCommission ?? 0,
      bonus: row?.bonus ?? 0,
      installationPayout: row?.installationPayout ?? 0,
      removalPayout: row?.removalPayout ?? 0,
      supportPayout: row?.supportPayout ?? 0,
      deliveryPayout: row?.deliveryPayout ?? 0,
      collectionPayout: row?.collectionPayout ?? 0,
      overtimePay: row?.overtimePay ?? 0,
      totalIncome: row?.totalIncome ?? 0,
      completedTaskCount: row?.completedTaskCount ?? 0,
      inProgress: month === thisMonth,
    };
  });
}
