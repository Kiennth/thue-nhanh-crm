import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  computeLineDirectPayout,
  computeOrderCommissionFund,
  computeOrderPoolValue,
  computePoolExcludedTotal,
  computeTaskCommission,
  findCommissionRate,
  findTaskWeight,
  SERVICE_LINE_CATEGORY_BY_TYPE_ID,
  type PoolExcludedLineInput,
} from "@/lib/commission";
import type { TaskType } from "@/types/database";

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end, label: `${year}-${monthStr}` };
}

export interface BonusTierProgress {
  tierNumber: number;
  thresholdAmount: number;
  bonusAmount: number;
  achieved: boolean;
}

export interface MyPerformance {
  month: string;
  baseSalary: number;
  totalCommission: number;
  bonus: number;
  installationPayout: number;
  removalPayout: number;
  supportPayout: number;
  overtimePay: number;
  totalIncome: number;
  completedTaskCount: number;
  tiers: BonusTierProgress[];
  currentTierIndex: number;
  nextTier: BonusTierProgress | null;
  progressToNextTier: number;
}

// Dùng service-role client vì tính khoán cần đọc commission_tiers/task_weights/
// bonus_tiers (bị RLS chặn với nhân viên thường) — nhưng luôn lọc cứng theo
// đúng employeeId truyền vào ngay từ câu query, không trả dữ liệu người khác.
export async function computeMyPerformance(
  employeeId: string,
  branchId: string | null,
  baseSalary: number,
): Promise<MyPerformance> {
  const { start, end, label } = currentMonthRange();
  const admin = createAdminClient();

  const [taskList, { data: commissionTiers }, { data: taskWeights }, { data: bonusTiers }, { data: equipmentTypes }, allOrderLines, overtimeInMonth] =
    await Promise.all([
      fetchAllRows<{ task_type: TaskType; order_id: string }>((from, to) =>
        admin
          .from("order_tasks")
          .select("task_type, order_id")
          .eq("employee_id", employeeId)
          .not("completed_date", "is", null)
          .gte("completed_date", start)
          .lt("completed_date", end)
          .range(from, to),
      ),
      admin.from("commission_tiers").select("branch_id, min_value, max_value, percentage"),
      admin.from("task_weights").select("task_type, weight_percentage"),
      branchId
        ? admin.from("bonus_tiers").select("*").eq("branch_id", branchId).order("tier_number")
        : Promise.resolve({ data: [] as { tier_number: number; threshold_amount: number; bonus_amount: number }[] }),
      admin.from("equipment_types").select("id, payout_percentage"),
      fetchAllRows<{
        order_id: string;
        equipment_type_id: string | null;
        employee_id: string | null;
        completed_date: string | null;
        line_total: number;
      }>((from, to) =>
        admin
          .from("order_equipment")
          .select("order_id, equipment_type_id, employee_id, completed_date, line_total")
          .range(from, to),
      ),
      fetchAllRows<{ amount: number }>((from, to) =>
        admin
          .from("overtime_entries")
          .select("amount")
          .eq("employee_id", employeeId)
          .gte("entry_date", start)
          .lt("entry_date", end)
          .range(from, to),
      ),
    ]);

  // Không lọc orders bằng .in(id, orderIds) — nhân viên bận có thể liên quan
  // hàng trăm/nghìn đơn, danh sách IN dài cỡ đó dễ vượt giới hạn độ dài URL
  // của PostgREST. Lấy toàn bộ orders (phân trang) rồi tra bằng Map.
  const allOrders = await fetchAllRows<{ id: string; total_value: number; pickup_branch_id: string }>(
    (from, to) => admin.from("orders").select("id, total_value, pickup_branch_id").range(from, to),
  );
  const orderById = new Map(allOrders.map((o) => [o.id, o]));

  // Dòng dịch vụ trả khoán trực tiếp — loại khỏi quỹ khoán theo khâu của cả
  // đơn (không giới hạn theo tháng), tính riêng phần trả trực tiếp trong
  // tháng cho nhân viên này.
  const payoutPercentByTypeId = new Map(
    (equipmentTypes ?? [])
      .filter((t): t is { id: string; payout_percentage: number } => t.payout_percentage != null)
      .map((t) => [t.id, t.payout_percentage]),
  );
  const linesByOrderId = new Map<string, PoolExcludedLineInput[]>();
  for (const line of allOrderLines) {
    const list = linesByOrderId.get(line.order_id) ?? [];
    list.push(line);
    linesByOrderId.set(line.order_id, list);
  }
  const poolExclusionByOrderId = new Map(
    [...linesByOrderId.entries()].map(([orderId, lines]) => [
      orderId,
      computePoolExcludedTotal(lines, payoutPercentByTypeId),
    ]),
  );

  const servicePayout = allOrderLines.reduce(
    (acc, line) => {
      if (line.employee_id !== employeeId || !line.equipment_type_id || !line.completed_date) return acc;
      if (line.completed_date < start || line.completed_date >= end) return acc;
      const payoutPercentage = payoutPercentByTypeId.get(line.equipment_type_id);
      if (payoutPercentage == null) return acc;
      const category = SERVICE_LINE_CATEGORY_BY_TYPE_ID[line.equipment_type_id];
      if (!category) return acc;
      acc[category] += computeLineDirectPayout(line.line_total, payoutPercentage);
      return acc;
    },
    { installation: 0, removal: 0, support: 0 },
  );
  const overtimePay = overtimeInMonth.reduce((sum, entry) => sum + entry.amount, 0);

  const totalCommission = taskList.reduce((sum, t) => {
    const order = orderById.get(t.order_id);
    if (!order) return sum;
    const poolValue = computeOrderPoolValue(order.total_value, poolExclusionByOrderId.get(order.id) ?? 0);
    const rate = findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, poolValue);
    const fund = computeOrderCommissionFund(poolValue, rate);
    const weight = findTaskWeight(taskWeights ?? [], t.task_type);
    return sum + computeTaskCommission(fund, weight);
  }, 0);

  const tierList: BonusTierProgress[] = (bonusTiers ?? [])
    .slice()
    .sort((a, b) => a.tier_number - b.tier_number)
    .map((t) => ({
      tierNumber: t.tier_number,
      thresholdAmount: t.threshold_amount,
      bonusAmount: t.bonus_amount,
      achieved: totalCommission >= t.threshold_amount,
    }));

  const currentTierIndex = tierList.reduce((idx, t, i) => (t.achieved ? i : idx), -1);
  const bonus = currentTierIndex >= 0 ? tierList[currentTierIndex].bonusAmount : 0;
  const nextTier = tierList.find((t) => !t.achieved) ?? null;

  const prevThreshold = currentTierIndex >= 0 ? tierList[currentTierIndex].thresholdAmount : 0;
  const progressToNextTier = nextTier
    ? Math.min(
        1,
        Math.max(0, (totalCommission - prevThreshold) / (nextTier.thresholdAmount - prevThreshold)),
      )
    : 1;

  return {
    month: label,
    baseSalary,
    totalCommission,
    bonus,
    installationPayout: servicePayout.installation,
    removalPayout: servicePayout.removal,
    supportPayout: servicePayout.support,
    overtimePay,
    totalIncome:
      baseSalary +
      totalCommission +
      bonus +
      servicePayout.installation +
      servicePayout.removal +
      servicePayout.support +
      overtimePay,
    completedTaskCount: taskList.length,
    tiers: tierList,
    currentTierIndex,
    nextTier,
    progressToNextTier,
  };
}
