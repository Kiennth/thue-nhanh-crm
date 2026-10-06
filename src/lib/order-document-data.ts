import { VAT_RATE } from "@/lib/order-labels";
import { computeRentalDurationInUnit } from "@/lib/rental-pricing";
import type { ProductType, RentalPeriodUnit, TrackingType } from "@/types/database";

const SERVICE_UNIT_LABELS: Record<RentalPeriodUnit, string> = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng", year: "năm" };

// Dữ liệu dòng hàng đã gom sẵn cho các chứng từ in (Báo giá, Đề nghị thanh
// toán, Biên bản bàn giao, Biên bản nghiệm thu) — theo mẫu CEO gửi 2026-09-30.
// Bảng trên chứng từ có cột: Mô tả · ĐVT · Số lượng · Số ngày · Đơn giá/ngày ·
// Đơn giá/gói · Thành tiền · VAT · Tổng.

export interface DocLine {
  id: string;
  parent_line_id: string | null;
  equipment_type_id: string | null;
  custom_name: string | null;
  equipment_unit_id: string | null;
  equipment_instance_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  charge_duration: number | null;
  extra_information: string | null;
}

export interface DocEquipmentType {
  id: string;
  name: string;
  product_type: ProductType;
  tracking_type: TrackingType | null;
  rental_period_unit: RentalPeriodUnit | null;
  deposit_amount: number | null;
}

export interface DocRow {
  key: string;
  description: string;
  // Biến thể / các món trong combo — in dòng nhỏ dưới mô tả.
  details: string[];
  // Ghi chú hiển thị của dòng (phụ kiện đi kèm, địa chỉ giao...).
  note: string | null;
  serials: string[];
  unit: string;
  quantity: number;
  // Số kỳ tính tiền (ngày) — null với dịch vụ/bán/dòng tự do (tính theo gói).
  days: number | null;
  pricePerDay: number | null;
  pricePerPackage: number | null;
  amount: number;
  vat: number;
  total: number;
  isRental: boolean;
  // Dòng dịch vụ (phí giao/thu hồi, lắp đặt...) — không nằm trong biên bản
  // bàn giao thiết bị.
  isService: boolean;
}

export interface DocTotals {
  rental: number; // Tiền thuê chưa VAT (mọi dòng)
  vat: number;
  rentalWithVat: number;
  deposit: number;
  grand: number; // Tiền thuê (gồm VAT) + ký quỹ
}

const round0 = (n: number) => Math.round(n);

export function buildDocRows({
  lines,
  typeById,
  unitNameById,
  unitCountByType,
  instanceCodeById,
  rentalStartAt,
  rentalEndAt,
}: {
  lines: DocLine[];
  typeById: Map<string, DocEquipmentType>;
  unitNameById: Map<string, string>;
  unitCountByType: Map<string, number>;
  instanceCodeById: Map<string, string>;
  rentalStartAt: string | null;
  rentalEndAt: string | null;
}): DocRow[] {
  const durationOf = (type: DocEquipmentType | undefined, override: number | null) => {
    if (override != null) return override;
    if (!type?.rental_period_unit || !rentalStartAt || !rentalEndAt) return null;
    return computeRentalDurationInUnit(rentalStartAt, rentalEndAt, type.rental_period_unit);
  };
  const finish = (row: Omit<DocRow, "vat" | "total">): DocRow => {
    const vat = round0(row.amount * VAT_RATE);
    return { ...row, vat, total: row.amount + vat };
  };

  const childrenByParent = new Map<string, DocLine[]>();
  for (const line of lines) {
    if (!line.parent_line_id) continue;
    childrenByParent.set(line.parent_line_id, [...(childrenByParent.get(line.parent_line_id) ?? []), line]);
  }

  const rows: DocRow[] = [];
  const groupRowByKey = new Map<string, Omit<DocRow, "vat" | "total">>();
  const pending: (Omit<DocRow, "vat" | "total"> | null)[] = [];

  for (const line of lines) {
    if (line.parent_line_id) continue;
    const type = line.equipment_type_id ? typeById.get(line.equipment_type_id) : undefined;
    const children = childrenByParent.get(line.id) ?? [];

    // Combo: 1 dòng giá bộ, các món liệt kê dưới mô tả.
    if (children.length || type?.tracking_type === "combo") {
      const amount = children.reduce((sum, c) => sum + c.line_total, 0);
      const days = durationOf(type, line.charge_duration);
      pending.push({
        key: line.id,
        description: type?.name ?? line.custom_name ?? "—",
        details: children.map((c) => {
          const childType = c.equipment_type_id ? typeById.get(c.equipment_type_id) : undefined;
          const code = c.equipment_instance_id ? instanceCodeById.get(c.equipment_instance_id) : null;
          return `${c.quantity > 1 ? `${c.quantity} × ` : ""}${childType?.name ?? "—"}${code ? ` (${code})` : ""}`;
        }),
        note: line.extra_information,
        serials: children
          .map((c) => (c.equipment_instance_id ? instanceCodeById.get(c.equipment_instance_id) : null))
          .filter((v): v is string => !!v),
        unit: "bộ",
        quantity: line.quantity,
        days,
        pricePerDay: days ? round0(amount / Math.max(1, line.quantity) / days) : null,
        pricePerPackage: null,
        amount,
        isRental: true,
        isService: false,
      });
      continue;
    }

    const isRental = type?.product_type === "rental";
    // Dịch vụ theo giờ/ngày: cột "số kỳ" = số giờ (charge_duration, mặc định 1), đơn vị "giờ".
    const serviceUnit = type?.product_type === "service" ? type.rental_period_unit : null;
    const days = isRental ? durationOf(type, line.charge_duration) : serviceUnit ? (line.charge_duration ?? 1) : null;

    // Máy serial cùng sản phẩm + cùng đơn giá + cùng số kỳ → gộp 1 dòng, SL =
    // số máy, serial liệt kê riêng (mẫu biên bản bàn giao có cột Serial).
    // Gồm cả dòng serial chưa gán (instance null) — gộp chung, không có serial.
    if (isRental && type?.tracking_type === "individual") {
      const key = `${line.equipment_type_id}|${line.unit_price}|${line.charge_duration ?? ""}`;
      const code = line.equipment_instance_id ? instanceCodeById.get(line.equipment_instance_id) : undefined;
      const existing = groupRowByKey.get(key);
      if (existing) {
        existing.quantity += line.quantity;
        existing.amount += line.line_total;
        if (code) existing.serials.push(code);
        if (!existing.note && line.extra_information) existing.note = line.extra_information;
        continue;
      }
      const row: Omit<DocRow, "vat" | "total"> = {
        key: line.id,
        description: type?.name ?? "—",
        details: [],
        note: line.extra_information,
        serials: code ? [code] : [],
        unit: "bộ",
        quantity: line.quantity,
        days,
        pricePerDay: days ? round0(line.unit_price / days) : null,
        pricePerPackage: null,
        amount: line.line_total,
        isRental: true,
        isService: false,
      };
      groupRowByKey.set(key, row);
      pending.push(row);
      continue;
    }

    const variant =
      line.equipment_unit_id && type && (unitCountByType.get(type.id) ?? 0) > 1
        ? unitNameById.get(line.equipment_unit_id)
        : null;
    pending.push({
      key: line.id,
      description: type?.name ?? line.custom_name ?? "—",
      details: variant && variant !== type?.name ? [variant] : [],
      note: line.extra_information,
      serials: [],
      unit: isRental ? "bộ" : type?.product_type === "sale" ? "cái" : serviceUnit ? SERVICE_UNIT_LABELS[serviceUnit] : "gói",
      quantity: line.quantity,
      days,
      pricePerDay: (isRental || serviceUnit) && days ? round0(line.unit_price / days) : null,
      pricePerPackage: isRental || serviceUnit ? null : line.unit_price,
      amount: line.line_total,
      isRental,
      isService: type?.product_type === "service",
    });
  }

  for (const row of pending) if (row) rows.push(finish(row));
  return rows;
}

// Tiền ký quỹ của đơn — cùng công thức trang chi tiết đơn: tổng (cọc/đơn vị ×
// SL) các dòng cho thuê (combo không cọc riêng, cọc nằm ở món con) × tỉ lệ cọc
// của khách, làm tròn triệu; có số sửa tay trên đơn thì dùng số đó.
export function computeOrderDeposit({
  lines,
  typeById,
  customerDepositPercentage,
  depositOverrideAmount,
}: {
  lines: DocLine[];
  typeById: Map<string, DocEquipmentType>;
  customerDepositPercentage: number;
  depositOverrideAmount: number | null | undefined;
}): number {
  if (depositOverrideAmount != null) return depositOverrideAmount;
  const raw = lines.reduce((sum, line) => {
    const type = line.equipment_type_id ? typeById.get(line.equipment_type_id) : undefined;
    if (type?.product_type !== "rental" || type.tracking_type === "combo") return sum;
    return sum + (type.deposit_amount ?? 0) * line.quantity;
  }, 0);
  // Làm tròn đến 100.000đ (CEO 2026-10-05) — cùng công thức trang đơn.
  return Math.round((raw * customerDepositPercentage) / 100 / 100_000) * 100_000;
}

export function computeDocTotals(rows: DocRow[], deposit: number): DocTotals {
  const rental = rows.reduce((sum, r) => sum + r.amount, 0);
  const vat = round0(rental * VAT_RATE);
  return { rental, vat, rentalWithVat: rental + vat, deposit, grand: rental + vat + deposit };
}
