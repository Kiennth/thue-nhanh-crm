import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  computeOrderCommissionFund,
  computeTaskCommission,
  findCommissionRate,
  findTaskWeight,
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

  const [taskList, { data: commissionTiers }, { data: taskWeights }, { data: bonusTiers }] = await Promise.all([
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
  ]);

  // Không lọc orders bằng .in(id, orderIds) — nhân viên bận có thể liên quan
  // hàng trăm/nghìn đơn, danh sách IN dài cỡ đó dễ vượt giới hạn độ dài URL
  // của PostgREST. Lấy toàn bộ orders (phân trang) rồi tra bằng Map.
  const allOrders = await fetchAllRows<{ id: string; total_value: number; pickup_branch_id: string }>(
    (from, to) => admin.from("orders").select("id, total_value, pickup_branch_id").range(from, to),
  );
  const orderById = new Map(allOrders.map((o) => [o.id, o]));

  const totalCommission = taskList.reduce((sum, t) => {
    const order = orderById.get(t.order_id);
    if (!order) return sum;
    const rate = findCommissionRate(commissionTiers ?? [], order.pickup_branch_id, order.total_value);
    const fund = computeOrderCommissionFund(order.total_value, rate);
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
    totalIncome: baseSalary + totalCommission + bonus,
    completedTaskCount: taskList.length,
    tiers: tierList,
    currentTierIndex,
    nextTier,
    progressToNextTier,
  };
}
