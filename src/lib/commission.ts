import type { TaskType } from "@/types/database";

export interface CommissionTierInput {
  branch_id: string;
  min_value: number;
  max_value: number | null;
  percentage: number;
}

export interface BonusTierInput {
  branch_id: string;
  threshold_amount: number;
  bonus_amount: number;
}

export interface TaskWeightInput {
  task_type: TaskType;
  weight_percentage: number;
}

// % hoa hồng của đơn = bậc mà min_value <= doanh số <= max_value (max_value
// null nghĩa là không giới hạn trên), tra theo chi nhánh của ĐƠN.
export function findCommissionRate(
  tiers: CommissionTierInput[],
  branchId: string,
  totalValue: number,
): number {
  const tier = tiers.find(
    (t) =>
      t.branch_id === branchId &&
      totalValue >= t.min_value &&
      (t.max_value === null || totalValue <= t.max_value),
  );
  return tier?.percentage ?? 0;
}

// Tổng quỹ khoán đơn = Doanh số x %hoa hồng (theo chi nhánh của đơn).
export function computeOrderCommissionFund(totalValue: number, commissionRatePercent: number): number {
  return round2(totalValue * (commissionRatePercent / 100));
}

// Phần khoán của 1 khâu = Tổng quỹ khoán đơn x tỷ trọng khâu đó.
export function computeTaskCommission(fund: number, taskWeightPercent: number): number {
  return round2(fund * (taskWeightPercent / 100));
}

export function findTaskWeight(weights: TaskWeightInput[], taskType: TaskType): number {
  return weights.find((w) => w.task_type === taskType)?.weight_percentage ?? 0;
}

// Bậc thưởng = ngưỡng cao nhất mà tổng khoán trong tháng đạt tới, KHÔNG cộng
// dồn nhiều bậc — tra theo chi nhánh biên chế của nhân viên.
export function findBonusAmount(
  tiers: BonusTierInput[],
  branchId: string,
  totalMonthlyCommission: number,
): number {
  const applicable = tiers
    .filter((t) => t.branch_id === branchId && totalMonthlyCommission >= t.threshold_amount)
    .sort((a, b) => b.threshold_amount - a.threshold_amount);
  return applicable[0]?.bonus_amount ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
