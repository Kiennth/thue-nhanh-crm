import type { PricingMethod, ProductType, RentalPeriodUnit } from "@/types/database";

export interface PricingTierInput {
  min_duration: number;
  duration_unit: RentalPeriodUnit;
  discount_percentage: number;
}

export interface ComputeLinePriceInput {
  productType: ProductType;
  price: number;
  rentalPeriodUnit: RentalPeriodUnit | null;
  pricingMethod: PricingMethod | null;
  tiers: PricingTierInput[];
  rentalStartAt: string | null;
  rentalEndAt: string | null;
  quantity: number;
  // Số kỳ tính tiền sửa tay trên dòng (order_equipment.charge_duration) — có
  // thì dùng thay cho số kỳ suy từ thời gian thuê của đơn.
  durationOverride?: number | null;
}

export interface ComputedLinePrice {
  unitPrice: number;
  lineTotal: number;
}

// Số giờ quy đổi 1 đơn vị thời gian thuê — "1 ngày" = đúng 24h kể từ thời
// điểm bắt đầu thuê (không tính theo ngày dương lịch).
const PERIOD_LENGTH_IN_HOURS: Record<RentalPeriodUnit, number> = {
  hour: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
  year: 24 * 365,
};

export function hoursBetween(startAt: string, endAt: string): number {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  return (end - start) / 3_600_000;
}

// Số giờ khoan trễ trước khi tính thêm 1 ngày — quy định công ty: 1 ngày thuê =
// 24h kể từ lúc nhận, trễ quá 2 tiếng mới tính sang ngày kế tiếp (trễ <= 2 tiếng
// vẫn tính là ngày đang thuê).
const DAY_GRACE_HOURS = 2;

function computeDayCount(hours: number): number {
  const fullDays = Math.floor(hours / 24);
  const remainderHours = hours - fullDays * 24;
  const days = remainderHours > DAY_GRACE_HOURS ? fullDays + 1 : fullDays;
  return Math.max(1, days);
}

export function computeRentalDurationInUnit(
  rentalStartAt: string,
  rentalEndAt: string,
  rentalPeriodUnit: RentalPeriodUnit,
): number {
  const hours = hoursBetween(rentalStartAt, rentalEndAt);
  if (rentalPeriodUnit === "day") {
    return computeDayCount(hours);
  }
  return Math.max(1, Math.ceil(hours / PERIOD_LENGTH_IN_HOURS[rentalPeriodUnit]));
}

// Các gói thuê có sẵn để chọn nhanh (thời gian kết thúc tự tính = bắt đầu +
// số giờ của gói). Gói theo ngày dùng đúng bội số 24h — quy đổi "ngày" hiển
// thị vẫn tuân theo computeRentalDurationInUnit (grace 2 tiếng) khi tính giá.
export interface RentalPresetOption {
  key: string;
  label: string;
  hours: number;
  // Gói cam kết N tháng — giá hiển thị chia đều mỗi tháng.
  commitMonths?: number;
}

export const RENTAL_PRESET_OPTIONS: RentalPresetOption[] = [
  { key: "3h", label: "3 giờ", hours: 3 },
  { key: "6h", label: "6 giờ", hours: 6 },
  { key: "9h", label: "9 giờ", hours: 9 },
  { key: "1d", label: "1 ngày", hours: 24 * 1 },
  { key: "2d", label: "2 ngày", hours: 24 * 2 },
  { key: "3d", label: "3 ngày", hours: 24 * 3 },
  { key: "4d", label: "4 ngày", hours: 24 * 4 },
  { key: "5d", label: "5 ngày", hours: 24 * 5 },
  { key: "6d", label: "6 ngày", hours: 24 * 6 },
  { key: "7d", label: "7 ngày", hours: 24 * 7 },
  { key: "14d", label: "14 ngày", hours: 24 * 14 },
  { key: "30d", label: "1 tháng", hours: 24 * 30 },
  // Gói cam kết dài hạn (CEO 2026-10-01). Web: chỉ nhóm máy tính / điện
  // thoại / máy tính bảng, giá hiển thị là giá MỖI THÁNG; CRM: luôn hiện, nhãn "N tháng"
  // (tổng gói ÷ số tháng). 1 tháng = 30 ngày theo đúng quy ước tính giá
  // (PERIOD_LENGTH_IN_HOURS.month) — 12 tháng = 360 ngày, không lấy 365 vì
  // SP giá theo tháng sẽ bị tính thành 13 tháng.
  { key: "3m", label: "1 tháng (cam kết 3 tháng)", hours: 24 * 30 * 3, commitMonths: 3 },
  { key: "6m", label: "1 tháng (cam kết 6 tháng)", hours: 24 * 30 * 6, commitMonths: 6 },
  { key: "12m", label: "1 tháng (cam kết 12 tháng)", hours: 24 * 30 * 12, commitMonths: 12 },
];

// Mặc định thời gian bắt đầu thuê khi tạo mới = hiện tại + 1 tiếng, làm tròn
// lên giờ chẵn gần nhất (đủ thời gian làm hồ sơ thủ tục trước khi giao hàng).
export function defaultRentalStart(now: Date): Date {
  const plusOneHour = new Date(now.getTime() + 3_600_000);
  const needsRoundUp =
    plusOneHour.getMinutes() !== 0 ||
    plusOneHour.getSeconds() !== 0 ||
    plusOneHour.getMilliseconds() !== 0;
  plusOneHour.setMinutes(0, 0, 0);
  if (needsRoundUp) {
    plusOneHour.setHours(plusOneHour.getHours() + 1);
  }
  return plusOneHour;
}

// Bậc giảm giá áp dụng = bậc có ngưỡng lớn nhất mà vẫn <= thời gian thuê thực
// tế (hiệu ứng ngưỡng, giống commission_tiers). Ngưỡng bậc và thời gian thuê
// đều quy ra GIỜ để so — bậc "1 tháng" (= 30 ngày) áp được cho mã thuê theo
// ngày. Trước 2026-10-06 chỉ so bậc cùng đơn vị với mã → mọi mã đều thuê theo
// ngày nên các bậc tháng (80/82/84/88%) không bao giờ ăn, thuê 30+ ngày vẫn
// chỉ giảm 65% (bậc 14 ngày) — CEO rà lại công thức: 1tr/ngày → 1 tháng 6tr.
export function findApplicableTier(
  tiers: PricingTierInput[],
  rentalPeriodUnit: RentalPeriodUnit,
  durationInUnit: number,
): PricingTierInput | null {
  const rentedHours = durationInUnit * PERIOD_LENGTH_IN_HOURS[rentalPeriodUnit];
  const thresholdHours = (t: PricingTierInput) => t.min_duration * PERIOD_LENGTH_IN_HOURS[t.duration_unit];
  const applicable = tiers
    .filter((t) => thresholdHours(t) <= rentedHours)
    .sort((a, b) => thresholdHours(b) - thresholdHours(a));
  return applicable[0] ?? null;
}

// Giá thuê theo bậc — quy tắc CEO 2026-10-06 (sau đơn PO13142: 25 ngày ở bậc
// 14 ngày 65% = 2.625.000đ, đắt hơn 30 ngày 1.800.000đ):
//  1. Dưới 1 tháng: giá trọn gói tại từng mốc bậc (ngưỡng × giá × (1 − %)),
//     ngày lẻ giữa 2 mốc NỘI SUY tuyến tính giữa giá 2 gói gần nhất
//     (9–10 ngày ≈ trung bình gói 7 và gói 14). Làm tròn nghìn đồng.
//  2. Từ 1 tháng (mốc có duration_unit "month"): giá ngày = giá tháng / 30,
//     thuê thêm ngày nào cộng ngày đó = tuyến tính × (1 − % bậc tháng đang áp).
//     Các mốc cam kết 3/6/12 tháng là bậc riêng, không nội suy vào.
export function tieredPrice(
  price: number,
  rentalPeriodUnit: RentalPeriodUnit,
  durationInUnit: number,
  tiers: PricingTierInput[],
): number {
  const unitHours = PERIOD_LENGTH_IN_HOURS[rentalPeriodUnit];
  const rentedHours = durationInUnit * unitHours;
  const thresholdHours = (t: PricingTierInput) => t.min_duration * PERIOD_LENGTH_IN_HOURS[t.duration_unit];
  const packagePrice = (t: PricingTierInput) =>
    (price * thresholdHours(t) * (1 - t.discount_percentage / 100)) / unitHours;
  const lower = findApplicableTier(tiers, rentalPeriodUnit, durationInUnit);
  const linear = price * durationInUnit;
  // Chưa tới mốc đầu tiên, hoặc đã qua mốc tháng → tuyến tính theo % bậc đang áp.
  if (!lower) return linear;
  if (lower.duration_unit === "month" || thresholdHours(lower) === rentedHours) {
    return linear * (1 - lower.discount_percentage / 100);
  }
  const upper = tiers
    .filter((t) => thresholdHours(t) > rentedHours)
    .sort((a, b) => thresholdHours(a) - thresholdHours(b))[0];
  if (!upper) return linear * (1 - lower.discount_percentage / 100);
  const lo = thresholdHours(lower);
  const hi = thresholdHours(upper);
  const ratio = (rentedHours - lo) / (hi - lo);
  const interpolated = packagePrice(lower) + (packagePrice(upper) - packagePrice(lower)) * ratio;
  return Math.round(interpolated / 1000) * 1000;
}

export function computeOrderLinePrice(input: ComputeLinePriceInput): ComputedLinePrice {
  const { productType, price, quantity } = input;

  if (productType !== "rental") {
    return { unitPrice: price, lineTotal: round2(price * quantity) };
  }

  const hasOverride = input.durationOverride != null && input.durationOverride > 0;
  if (!input.rentalPeriodUnit || (!hasOverride && (!input.rentalStartAt || !input.rentalEndAt))) {
    throw new Error("Hàng cho thuê phải có ngày giờ bắt đầu, kết thúc và đơn vị thời gian.");
  }

  const durationInUnit = hasOverride
    ? input.durationOverride!
    : computeRentalDurationInUnit(input.rentalStartAt!, input.rentalEndAt!, input.rentalPeriodUnit);
  const linear = price * durationInUnit;

  let unitPrice = linear;
  if (input.pricingMethod === "pricing_structure") {
    unitPrice = tieredPrice(price, input.rentalPeriodUnit, durationInUnit, input.tiers);
  }

  return { unitPrice: round2(unitPrice), lineTotal: round2(unitPrice * quantity) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
