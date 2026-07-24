import type { EquipmentInstanceStatus, ProductType } from "@/types/database";

export interface PurchaseInput {
  equipment_unit_id: string;
  quantity: number;
  unit_cost: number;
}

export interface DisposalInput {
  equipment_unit_id: string;
  quantity: number;
  unit_price: number;
}

export interface StockInput {
  equipment_unit_id: string;
  quantity_total: number;
}

export interface OrderLineInput {
  equipment_type_id: string | null;
  line_total: number;
}

export interface InstanceInput {
  equipment_type_id: string;
  purchase_price: number | null;
  disposal_price: number | null;
  status: EquipmentInstanceStatus;
}

export interface EquipmentTypeReport {
  equipmentTypeId: string;
  purchaseCost: number;
  disposalProceeds: number;
  revenue: number;
  rentalCount: number;
  currentInventoryValue: number;
  profit: number;
  // Tỉ suất lợi nhuận = tổng tiền đã thu về (doanh thu + thanh lý) / tiền đã
  // bỏ ra mua — KHÔNG trừ giá vốn, nên luôn >= 0 (0% = chưa thu lại đồng nào,
  // 100% = đã hoà vốn, >100% = đã có lãi). null nếu chưa có giá vốn.
  profitRatio: number | null;
}

// Giá vốn bình quân gia quyền theo các lần mua.
export function computeWeightedAverageCost(
  purchases: { quantity: number; unit_cost: number }[],
): number {
  const totalQty = purchases.reduce((sum, p) => sum + p.quantity, 0);
  if (totalQty === 0) return 0;
  const totalCost = purchases.reduce((sum, p) => sum + p.quantity * p.unit_cost, 0);
  return totalCost / totalQty;
}

// Tổng hợp theo từng loại hàng hoá (equipment_type):
//   - purchaseCost: tổng tiền đã bỏ ra mua (biến thể số lượng + sản phẩm riêng lẻ)
//   - disposalProceeds: tổng tiền thu được khi bán/thanh lý
//   - revenue: tổng doanh thu từ các dòng đơn hàng (thuê hoặc bán)
//   - rentalCount: số lượt xuất hiện trong đơn hàng (đo mức độ "cho thuê nhiều")
//   - currentInventoryValue: giá trị tồn kho hiện tại (số lượng còn giữ x giá vốn)
//   - profit = revenue + disposalProceeds - purchaseCost
//   - profitRatio = (revenue + disposalProceeds) / purchaseCost (không trừ giá
//     vốn nên luôn >= 0 — null nếu chưa có giá vốn)
export function computeEquipmentTypeReports(
  types: { id: string; product_type: ProductType }[],
  units: { id: string; equipment_type_id: string }[],
  instances: InstanceInput[],
  purchases: PurchaseInput[],
  disposals: DisposalInput[],
  stock: StockInput[],
  orderLines: OrderLineInput[],
): Map<string, EquipmentTypeReport> {
  const unitIdsByType = new Map<string, string[]>();
  for (const u of units) {
    const list = unitIdsByType.get(u.equipment_type_id) ?? [];
    list.push(u.id);
    unitIdsByType.set(u.equipment_type_id, list);
  }

  const purchasesByUnit = new Map<string, PurchaseInput[]>();
  for (const p of purchases) {
    const list = purchasesByUnit.get(p.equipment_unit_id) ?? [];
    list.push(p);
    purchasesByUnit.set(p.equipment_unit_id, list);
  }

  const disposalsByUnit = new Map<string, DisposalInput[]>();
  for (const d of disposals) {
    const list = disposalsByUnit.get(d.equipment_unit_id) ?? [];
    list.push(d);
    disposalsByUnit.set(d.equipment_unit_id, list);
  }

  const stockByUnit = new Map<string, StockInput[]>();
  for (const s of stock) {
    const list = stockByUnit.get(s.equipment_unit_id) ?? [];
    list.push(s);
    stockByUnit.set(s.equipment_unit_id, list);
  }

  const instancesByType = new Map<string, InstanceInput[]>();
  for (const inst of instances) {
    const list = instancesByType.get(inst.equipment_type_id) ?? [];
    list.push(inst);
    instancesByType.set(inst.equipment_type_id, list);
  }

  const revenueByType = new Map<string, number>();
  const countByType = new Map<string, number>();
  for (const line of orderLines) {
    if (!line.equipment_type_id) continue; // dòng tự do — không gắn loại hàng, không tính vào báo cáo theo loại
    revenueByType.set(line.equipment_type_id, (revenueByType.get(line.equipment_type_id) ?? 0) + line.line_total);
    countByType.set(line.equipment_type_id, (countByType.get(line.equipment_type_id) ?? 0) + 1);
  }

  const result = new Map<string, EquipmentTypeReport>();

  for (const type of types) {
    const unitIds = unitIdsByType.get(type.id) ?? [];
    const typeInstances = instancesByType.get(type.id) ?? [];

    let purchaseCost = 0;
    let disposalProceeds = 0;
    let currentInventoryValue = 0;

    for (const unitId of unitIds) {
      const unitPurchases = purchasesByUnit.get(unitId) ?? [];
      const unitDisposals = disposalsByUnit.get(unitId) ?? [];
      const unitStock = stockByUnit.get(unitId) ?? [];

      const avgCost = computeWeightedAverageCost(unitPurchases);
      purchaseCost += unitPurchases.reduce((sum, p) => sum + p.quantity * p.unit_cost, 0);
      disposalProceeds += unitDisposals.reduce((sum, d) => sum + d.quantity * d.unit_price, 0);
      const totalQty = unitStock.reduce((sum, row) => sum + row.quantity_total, 0);
      currentInventoryValue += totalQty * avgCost;
    }

    for (const inst of typeInstances) {
      if (inst.purchase_price) purchaseCost += inst.purchase_price;
      if (inst.status === "disposed" && inst.disposal_price) disposalProceeds += inst.disposal_price;
      if (inst.status !== "disposed" && inst.purchase_price) currentInventoryValue += inst.purchase_price;
    }

    const revenue = revenueByType.get(type.id) ?? 0;
    const rentalCount = countByType.get(type.id) ?? 0;
    const profit = revenue + disposalProceeds - purchaseCost;
    const profitRatio = purchaseCost > 0 ? (revenue + disposalProceeds) / purchaseCost : null;

    result.set(type.id, {
      equipmentTypeId: type.id,
      purchaseCost,
      disposalProceeds,
      revenue,
      rentalCount,
      currentInventoryValue,
      profit,
      profitRatio,
    });
  }

  return result;
}
