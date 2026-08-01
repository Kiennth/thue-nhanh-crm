import type { DeliveryMethod, TaskType } from "@/types/database";

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

// Khoán trực tiếp của 1 dòng dịch vụ (Lắp đặt/Tháo dỡ/Hỗ trợ kỹ thuật) = Giá
// trị dòng x %payout của loại dịch vụ đó — trả thẳng cho người thực hiện,
// KHÔNG qua quỹ khoán theo khâu.
export function computeLineDirectPayout(lineTotal: number, payoutPercentage: number): number {
  return round2(lineTotal * (payoutPercentage / 100));
}

export interface PoolExcludedLineInput {
  equipment_type_id: string | null;
  line_total: number;
}

// Tổng giá trị các dòng dịch vụ trả khoán trực tiếp (Lắp đặt/Tháo dỡ/Hỗ trợ
// kỹ thuật... có payout_percentage CỐ ĐỊNH, cộng phí vận chuyển giao/thu hồi
// bằng xe máy có payout %ĐỘNG — xem TRANSPORT_LINE_CATEGORY_BY_TYPE_ID) —
// dùng để loại ra khỏi giá trị đơn trước khi tra bậc %hoa hồng/tính quỹ
// khoán theo khâu, tránh tính khoán 2 lần cho cùng 1 đồng doanh số.
export function computePoolExcludedTotal(
  lines: PoolExcludedLineInput[],
  directPayoutTypeIds: Set<string>,
): number {
  return lines.reduce((sum, line) => {
    if (line.equipment_type_id && directPayoutTypeIds.has(line.equipment_type_id)) {
      return sum + line.line_total;
    }
    return sum;
  }, 0);
}

// Giá trị đơn dùng để tra bậc %hoa hồng/tính quỹ khoán theo khâu — đã loại
// doanh số các dòng dịch vụ trả khoán trực tiếp.
export function computeOrderPoolValue(totalValue: number, excludedTotal: number): number {
  return Math.max(0, totalValue - excludedTotal);
}

export type ServiceLineCategory = "installation" | "removal" | "support";

// 3 SKU dịch vụ trả khoán trực tiếp hiện có trong equipment_types, nhận diện
// theo id (không đổi dù tên SKU bị sửa sau này) — dùng để tách "Phí dịch vụ"
// thành 3 cột riêng (Lắp đặt / Thu hồi / Support) trên bảng lương. SKU dịch
// vụ khác có payout_percentage nhưng không nằm trong map này (nếu có) vẫn
// được cộng vào totalIncome qua computeLineDirectPayout, chỉ không lên cột
// riêng nào trong 3 cột trên.
export const SERVICE_LINE_CATEGORY_BY_TYPE_ID: Record<string, ServiceLineCategory> = {
  "d05bbc53-4d85-4da8-972f-ca0e7545622c": "installation", // Phí dịch vụ Lắp Đặt | Installation Fee
  "a364f692-c8ea-4b0d-84de-1e762fe6d29d": "removal", // Phí dịch vụ tháo dỡ | Removal Fee
  "5c0e4a96-38e4-4925-b7b6-331409e70d54": "support", // Phí dịch vụ hỗ trợ kỹ thuật| On site support
};

export type TransportLineCategory = "delivery" | "collection";

// 2 SKU phí vận chuyển (giao/thu hồi bằng xe máy) trả khoán trực tiếp — khác
// SERVICE_LINE_CATEGORY_BY_TYPE_ID ở chỗ %payout KHÔNG cố định trên
// equipment_types (payout_percentage để null), mà tính động theo giờ hẹn +
// cách thực hiện, xem computeTransportPayoutPercentage().
export const TRANSPORT_LINE_CATEGORY_BY_TYPE_ID: Record<string, TransportLineCategory> = {
  "38f5c644-3898-4b1f-a3f5-901e55f77c6a": "delivery", // Phí giao hàng bằng xe máy | Bike Delivery
  "13c85fe0-8b13-4d76-9df5-a20b19598cc9": "collection", // Phí thu hồi bằng xe máy | Bike Collection
};

// 4 SKU phí vận chuyển (giao/thu hồi bằng xe máy HOẶC ô tô) — nơi trang chi
// tiết đơn hiện ô ghi chú địa chỉ + SĐT nhận/trả hàng (CEO chốt 2026-08-01).
// CỐ Ý tách khỏi TRANSPORT_LINE_CATEGORY_BY_TYPE_ID: 2 dòng ô tô chưa có
// payout_percentage lẫn %payout động, nên KHÔNG tham gia tính khoán — set
// này chỉ phục vụ hiển thị/quyền ghi chú, không đụng gì tới lương.
export const DELIVERY_NOTE_TYPE_IDS = new Set([
  ...Object.keys(TRANSPORT_LINE_CATEGORY_BY_TYPE_ID),
  "ce4a5f88-8daa-47c2-92fc-196d1fc321db", // Phí dịch vụ giao hàng bằng ô tô | Car Delivery
  "1a53924a-a070-44b0-9441-3f09042af7e7", // Phí dịch vụ thu hồi hàng bằng Ô tô | Car Collection
]);

const BUSINESS_HOURS_START_MINUTES = 8 * 60 + 30; // 8:30
const BUSINESS_HOURS_END_MINUTES = 17 * 60 + 30; // 17:30

function isWithinBusinessHours(dateTimeIso: string): boolean {
  const d = new Date(dateTimeIso);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return minutes >= BUSINESS_HOURS_START_MINUTES && minutes <= BUSINESS_HOURS_END_MINUTES;
}

// Quy định chia sẻ phí vận chuyển (thoả thuận với CEO, chống lạm dụng như
// nhân viên cũ từng bỏ bê việc để chạy giao hàng lấy 100% phí):
// - Đặt xe dịch vụ ngoài (không tự chạy): 0% — chỉ nhận khoán công việc.
// - Tự chạy NGOÀI giờ hành chính (8:30-17:30): 100%.
// - Tự chạy TRONG giờ hành chính: 50% (bắt buộc phải đi vì lý do nào đó).
// scheduledAt = giờ hẹn trên đơn (rental_start_at cho giao, rental_end_at
// cho thu hồi) — KHÔNG dùng giờ hoàn thành tự khai, để tránh gian lận (giờ
// hẹn đã chốt từ lúc tạo đơn, mọi thay đổi đều có activity_log).
export function computeTransportPayoutPercentage(
  method: DeliveryMethod | null,
  scheduledAt: string | null,
): number {
  if (method !== "self_ride" || !scheduledAt) return 0;
  return isWithinBusinessHours(scheduledAt) ? 50 : 100;
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
