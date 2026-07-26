import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeWeightedAverageCost } from "@/lib/equipment-reports";

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
  now = new Date(),
): Promise<EquipmentValueOverview> {
  const supabase = await createClient();

  const [purchases, disposals, instances] = await Promise.all([
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
      let q = supabase.from("equipment_instances").select("purchase_price, purchase_date, disposal_date");
      if (branchId) q = q.eq("branch_id", branchId);
      return q.range(from, to);
    }),
  ]);

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

  return {
    trend: {
      week: buildWeekTrend(ctx, today),
      month: buildMonthTrend(ctx, today),
      year: buildYearTrend(ctx, today),
    },
  };
}
