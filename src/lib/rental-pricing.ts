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

export function computeRentalDurationInUnit(
  rentalStartAt: string,
  rentalEndAt: string,
  rentalPeriodUnit: RentalPeriodUnit,
): number {
  const hours = hoursBetween(rentalStartAt, rentalEndAt);
  return Math.max(1, Math.ceil(hours / PERIOD_LENGTH_IN_HOURS[rentalPeriodUnit]));
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
