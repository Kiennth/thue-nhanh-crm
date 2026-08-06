import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeWeightedAverageCost } from "@/lib/equipment-reports";
import { vnNow } from "@/lib/vn-time";

const WEEK_TREND_COUNT = 8;
const MONTH_TREND_COUNT = 6;
const YEAR_TREND_COUNT = 5;

interface PurchaseRow {
  equipment_unit_id: string;
  quantity: number;
  unit_cost: number;
  purchase_date: string;
}

interface DisposalRow {
  equipment_unit_id: string;
  quantity: number;
  disposal_date: string;
}

interface InstanceRow {
  equipment_type_id: string;
  purchase_price: number | null;
  purchase_date: string | null;
  disposal_date: string | null;
}

export interface EquipmentValueTrendPoint {
  label: string;
  value: number;
  quantity: number;
  // Giá trị/số lượng tại đúng ngày này 1 năm trước — chỉ có ở view tuần/tháng
  // (view năm tự thân đã là so sánh liên năm, xem từng năm 1 điểm).
  previousYearValue?: number;
  previousYearQuantity?: number;
}

export interface EquipmentValueOverview {
  trend: {
    week: EquipmentValueTrendPoint[];
    month: EquipmentValueTrendPoint[];
    year: EquipmentValueTrendPoint[];
  };
  // So sánh giá trị tồn kho hôm nay với đúng số dư cuối tháng trước — 2 điểm
  // cuối của trend.month (buildMonthTrend đã tự tính sẵn, không query lại).
  // CEO yêu cầu 2026-08-06: cần biết đang tăng/giảm bao nhiêu mà không phải
  // đọc biểu đồ.
  monthOverMonth: {
    currentValue: number;
    previousValue: number;
    deltaValue: number;
    deltaPercent: number | null;
  };
  // Loại hàng nào kéo tồn kho tăng nhiều nhất trong tháng — cùng công thức
  // dựng số dư theo thời điểm (weighted-average cost) như trend, chỉ tách
  // riêng theo equipment_type thay vì gộp tổng. Chỉ giữ loại có tăng (>0) —
  // trả lời đúng câu hỏi "tồn kho đang phình ra ở đâu", khác totalInventoryValue
  // vốn là số TĨNH tại 1 thời điểm.
  topStockIncrease: { equipmentTypeId: string; deltaValue: number }[];
}

function toDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function shiftYears(d: Date, years: number) {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}

// 364 ngày = đúng 52 tuần, dịch lùi giữ nguyên thứ trong tuần.
const ONE_YEAR_IN_WEEKS_DAYS = 364;

interface BalanceContext {
  purchasesByUnit: Map<string, PurchaseRow[]>;
  disposalsByUnit: Map<string, DisposalRow[]>;
  instances: InstanceRow[];
}

// Giá trị/số lượng tồn kho TẠI THỜI ĐIỂM asOf — tái dựng từ lịch sử mua/thanh
// lý (equipment_purchases/equipment_disposals có ngày, khác equipment_stock
// vốn chỉ lưu số hiện tại). Cùng công thức giá vốn bình quân gia quyền với
// computeEquipmentTypeReports, chỉ khác là chỉ tính các lần mua/thanh lý xảy
// ra TRƯỚC asOf thay vì toàn bộ.
function computeBalanceAsOf(ctx: BalanceContext, asOf: string): { value: number; quantity: number } {
  let value = 0;
  let quantity = 0;

  for (const [unitId, unitPurchases] of ctx.purchasesByUnit) {
    const purchasesUpTo = unitPurchases.filter((p) => p.purchase_date <= asOf);
    if (!purchasesUpTo.length) continue;
    const qtyPurchased = purchasesUpTo.reduce((sum, p) => sum + p.quantity, 0);
    const disposalsUpTo = (ctx.disposalsByUnit.get(unitId) ?? []).filter((d) => d.disposal_date <= asOf);
    const qtyDisposed = disposalsUpTo.reduce((sum, d) => sum + d.quantity, 0);
    const qtyRemaining = Math.max(0, qtyPurchased - qtyDisposed);
    if (qtyRemaining <= 0) continue;
    value += qtyRemaining * computeWeightedAverageCost(purchasesUpTo);
    quantity += qtyRemaining;
  }

  for (const inst of ctx.instances) {
    if (!inst.purchase_date || inst.purchase_date > asOf) continue;
    if (inst.disposal_date && inst.disposal_date <= asOf) continue;
    quantity += 1;
    value += inst.purchase_price ?? 0;
  }

  return { value, quantity };
}

function buildWeekTrend(ctx: BalanceContext, today: Date): EquipmentValueTrendPoint[] {
  const currentWeekStart = startOfWeekMonday(today);
  const points: EquipmentValueTrendPoint[] = [];
  for (let i = WEEK_TREND_COUNT - 1; i >= 0; i--) {
    const start = addDays(currentWeekStart, -7 * i);
    const end = addDays(start, 6);
    const asOfDate = i === 0 ? today : end;
    const { value, quantity } = computeBalanceAsOf(ctx, toDateStr(asOfDate));
    const lastYear = computeBalanceAsOf(ctx, toDateStr(addDays(asOfDate, -ONE_YEAR_IN_WEEKS_DAYS)));
    points.push({
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      value,
      quantity,
      previousYearValue: lastYear.value,
      previousYearQuantity: lastYear.quantity,
    });
  }
  return points;
}

function buildMonthTrend(ctx: BalanceContext, today: Date): EquipmentValueTrendPoint[] {
  const points: EquipmentValueTrendPoint[] = [];
  for (let i = MONTH_TREND_COUNT - 1; i >= 0; i--) {
    const bucketDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(bucketDate.getFullYear(), bucketDate.getMonth() + 1, 0);
    const asOfDate = i === 0 ? today : end;
    const { value, quantity } = computeBalanceAsOf(ctx, toDateStr(asOfDate));
    const lastYear = computeBalanceAsOf(ctx, toDateStr(shiftYears(asOfDate, -1)));
    points.push({
      label: `Th${bucketDate.getMonth() + 1}`,
      value,
      quantity,
      previousYearValue: lastYear.value,
      previousYearQuantity: lastYear.quantity,
    });
  }
  return points;
}

// Tăng/giảm giá trị tồn kho trong tháng, tách riêng theo từng equipment_type
// — so số dư (computeBalanceAsOf) tại 2 mốc "hôm nay" và "cuối tháng trước"
// cho từng loại, thay vì tính 1 lần cho tổng như trend. Chỉ trả về loại có
// tăng (deltaValue > 0), sắp giảm dần, lấy top 10.
function computeMonthlyChangeByType(
  purchasesByUnit: Map<string, PurchaseRow[]>,
  disposalsByUnit: Map<string, DisposalRow[]>,
  instances: InstanceRow[],
  unitTypeMap: Map<string, string>,
  today: Date,
): { equipmentTypeId: string; deltaValue: number }[] {
  const purchasesByType = new Map<string, Map<string, PurchaseRow[]>>();
  for (const [unitId, rows] of purchasesByUnit) {
    const typeId = unitTypeMap.get(unitId);
    if (!typeId) continue;
    if (!purchasesByType.has(typeId)) purchasesByType.set(typeId, new Map());
    purchasesByType.get(typeId)!.set(unitId, rows);
  }
  const disposalsByType = new Map<string, Map<string, DisposalRow[]>>();
  for (const [unitId, rows] of disposalsByUnit) {
    const typeId = unitTypeMap.get(unitId);
    if (!typeId) continue;
    if (!disposalsByType.has(typeId)) disposalsByType.set(typeId, new Map());
    disposalsByType.get(typeId)!.set(unitId, rows);
  }
  const instancesByType = new Map<string, InstanceRow[]>();
  for (const inst of instances) {
    const list = instancesByType.get(inst.equipment_type_id) ?? [];
    list.push(inst);
    instancesByType.set(inst.equipment_type_id, list);
  }

  const allTypeIds = new Set([
    ...purchasesByType.keys(),
    ...disposalsByType.keys(),
    ...instancesByType.keys(),
  ]);

  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const previousAsOf = toDateStr(previousMonthEnd);
  const currentAsOf = toDateStr(today);

  const results: { equipmentTypeId: string; deltaValue: number }[] = [];
  for (const typeId of allTypeIds) {
    const typeCtx: BalanceContext = {
      purchasesByUnit: purchasesByType.get(typeId) ?? new Map(),
      disposalsByUnit: disposalsByType.get(typeId) ?? new Map(),
      instances: instancesByType.get(typeId) ?? [],
    };
    const current = computeBalanceAsOf(typeCtx, currentAsOf);
    const previous = computeBalanceAsOf(typeCtx, previousAsOf);
    const deltaValue = current.value - previous.value;
    if (deltaValue > 0) results.push({ equipmentTypeId: typeId, deltaValue });
  }

  results.sort((a, b) => b.deltaValue - a.deltaValue);
  return results.slice(0, 10);
}

function buildYearTrend(ctx: BalanceContext, today: Date): EquipmentValueTrendPoint[] {
  const points: EquipmentValueTrendPoint[] = [];
  for (let i = YEAR_TREND_COUNT - 1; i >= 0; i--) {
    const year = today.getFullYear() - i;
    const end = new Date(year, 11, 31);
    const asOfDate = i === 0 ? today : end;
    const { value, quantity } = computeBalanceAsOf(ctx, toDateStr(asOfDate));
    points.push({ label: String(year), value, quantity });
  }
  return points;
}

// Xu hướng giá trị/số lượng tồn kho theo tuần/tháng/năm — cho phần "tổng
// quan" ở trang /equipment. branchId = null → toàn hệ thống (Giám đốc/Admin/
// Kế toán), branchId cụ thể → chỉ chi nhánh đó (Cửa hàng trưởng).
export async function computeEquipmentValueOverview(
  branchId: string | null,
  now = vnNow(),
): Promise<EquipmentValueOverview> {
  const supabase = await createClient();

  const [purchases, disposals, rawInstances, individualTypes, units] = await Promise.all([
    fetchAllRows<PurchaseRow>((from, to) => {
      let q = supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost, purchase_date");
      if (branchId) q = q.eq("branch_id", branchId);
      return q.range(from, to);
    }),
    fetchAllRows<DisposalRow>((from, to) => {
      let q = supabase.from("equipment_disposals").select("equipment_unit_id, quantity, disposal_date");
      if (branchId) q = q.eq("branch_id", branchId);
      return q.range(from, to);
    }),
    fetchAllRows<InstanceRow>((from, to) => {
      let q = supabase
        .from("equipment_instances")
        .select("equipment_type_id, purchase_price, purchase_date, disposal_date");
      if (branchId) q = q.eq("branch_id", branchId);
      return q.range(from, to);
    }),
    supabase.from("equipment_types").select("id").eq("tracking_type", "individual"),
    // equipment_units là danh mục dùng chung (không branch-scoped) — chỉ cần
    // để tra equipment_type_id theo unit khi gộp topStockIncrease theo loại.
    fetchAllRows<{ id: string; equipment_type_id: string }>((from, to) =>
      supabase.from("equipment_units").select("id, equipment_type_id").range(from, to),
    ),
  ]);

  // equipment_instances chỉ áp dụng cho tracking_type='individual' — vài loại
  // hàng cũ bị đổi sang 'quantity' mà không dọn hết instance cũ (lỗi dữ liệu
  // có từ trước, xem migration 20260728000000). Lọc bỏ instance mồ côi để
  // không cộng đè lên giá trị đã tính từ units/equipment_purchases.
  const individualTypeIds = new Set((individualTypes.data ?? []).map((t) => t.id));
  const instances = rawInstances.filter((i) => individualTypeIds.has(i.equipment_type_id));

  const purchasesByUnit = new Map<string, PurchaseRow[]>();
  for (const p of purchases) {
    const list = purchasesByUnit.get(p.equipment_unit_id) ?? [];
    list.push(p);
    purchasesByUnit.set(p.equipment_unit_id, list);
  }
  const disposalsByUnit = new Map<string, DisposalRow[]>();
  for (const d of disposals) {
    const list = disposalsByUnit.get(d.equipment_unit_id) ?? [];
    list.push(d);
    disposalsByUnit.set(d.equipment_unit_id, list);
  }

  const ctx: BalanceContext = { purchasesByUnit, disposalsByUnit, instances };
  const today = toDateOnly(now);

  const monthTrend = buildMonthTrend(ctx, today);
  const currentPoint = monthTrend[monthTrend.length - 1];
  const previousPoint = monthTrend[monthTrend.length - 2];
  const deltaValue = currentPoint.value - previousPoint.value;

  const unitTypeMap = new Map(units.map((u) => [u.id, u.equipment_type_id] as const));

  return {
    trend: {
      week: buildWeekTrend(ctx, today),
      month: monthTrend,
      year: buildYearTrend(ctx, today),
    },
    monthOverMonth: {
      currentValue: currentPoint.value,
      previousValue: previousPoint.value,
      deltaValue,
      deltaPercent: previousPoint.value > 0 ? (deltaValue / previousPoint.value) * 100 : null,
    },
    topStockIncrease: computeMonthlyChangeByType(
      purchasesByUnit,
      disposalsByUnit,
      instances,
      unitTypeMap,
      today,
    ),
  };
}
