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
  { key: "30d", label: "30 ngày", hours: 24 * 30 },
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

// Bậc giảm giá áp dụng = bậc có min_duration lớn nhất mà vẫn <= số đơn vị thời
// gian thuê thực tế (hiệu ứng ngưỡng, giống commission_tiers).
export function findApplicableTier(
  tiers: PricingTierInput[],
  rentalPeriodUnit: RentalPeriodUnit,
  durationInUnit: number,
): PricingTierInput | null {
  const applicable = tiers
    .filter((t) => t.duration_unit === rentalPeriodUnit && t.min_duration <= durationInUnit)
    .sort((a, b) => b.min_duration - a.min_duration);
  return applicable[0] ?? null;
}

export function computeOrderLinePrice(input: ComputeLinePriceInput): ComputedLinePrice {
  const { productType, price, quantity } = input;

  if (productType !== "rental") {
    return { unitPrice: price, lineTotal: round2(price * quantity) };
  }

  if (!input.rentalStartAt || !input.rentalEndAt || !input.rentalPeriodUnit) {
    throw new Error("Hàng cho thuê phải có ngày giờ bắt đầu, kết thúc và đơn vị thời gian.");
  }

  const durationInUnit = computeRentalDurationInUnit(
    input.rentalStartAt,
    input.rentalEndAt,
    input.rentalPeriodUnit,
  );
  const linear = price * durationInUnit;

  let unitPrice = linear;
  if (input.pricingMethod === "pricing_structure") {
    const tier = findApplicableTier(input.tiers, input.rentalPeriodUnit, durationInUnit);
    if (tier) {
      unitPrice = linear * (1 - tier.discount_percentage / 100);
    }
  }

  return { unitPrice: round2(unitPrice), lineTotal: round2(unitPrice * quantity) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
