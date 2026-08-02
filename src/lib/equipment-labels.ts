import type {
  EquipmentInstanceStatus,
  PricingMethod,
  ProductType,
  RentalPeriodUnit,
  TrackingType,
} from "@/types/database";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  rental: "Cho thuê",
  sale: "Bán",
  service: "Dịch vụ",
};

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  quantity: "Theo số lượng",
  individual: "Theo từng sản phẩm",
};

export const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  flat_fee: "Giá cố định",
  pricing_structure: "Bảng giá mẫu",
};

export const RENTAL_PERIOD_UNIT_LABELS: Record<RentalPeriodUnit, string> = {
  hour: "giờ",
  day: "ngày",
  week: "tuần",
  month: "tháng",
  year: "năm",
};

export const EQUIPMENT_INSTANCE_STATUS_LABELS: Record<EquipmentInstanceStatus, string> = {
  available: "Sẵn có",
  rented: "Đang cho thuê",
  maintenance: "Bảo trì",
  disposed: "Đã thanh lý",
};

// Nhiều loại hàng hoá chỉ có đúng 1 biến thể (vd gói dịch vụ) — lúc tạo biến
// thể đó, người nhập không có hãng/model thật để điền nên gõ lại luôn tên
// loại hàng hoá cho đủ ô bắt buộc. Kết quả là cột "Biến thể/Sản phẩm" hiện
// trùng y hệt cột "Hàng hoá". Hàm này ẩn phần trùng lặp đó, không đụng dữ
// liệu gốc — biến thể thật sự khác tên (vd LG/TCL/Hisense) vẫn hiện bình
// thường.
// Nhãn hiển thị cho 1 máy serialize — biến thể (nếu có) đứng trước serial để
// phân biệt lúc 1 loại hàng có nhiều cấu hình bán hàng (VD iPad Wi-Fi vs
// Wi-Fi+5G, mỗi máy vẫn giữ mã định danh riêng). Đa số máy chưa gán biến
// thể nào — lúc đó chỉ hiện đúng mã định danh như trước giờ.
export function equipmentInstanceLabel(
  unitBrandModel: string | null | undefined,
  identifierCode: string,
): string {
  return unitBrandModel ? `${unitBrandModel} — ${identifierCode}` : identifierCode;
}

export function equipmentDetailLabel(
  typeName: string | null | undefined,
  detail: string | null | undefined,
  options?: {
    // Loại hàng chỉ có đúng 1 biến thể → tên biến thể không phân biệt gì
    // thêm, ẩn luôn kể cả khi đặt khác tên sản phẩm ("Apple Pencil Pro" /
    // "Bút cảm ứng Apple Pencil Pro"). Chỉ áp cho biến thể (equipment_units)
    // — mã sản phẩm riêng lẻ (identifier_code) vẫn luôn hiện vì đó là thông
    // tin bàn giao thật.
    soleVariant?: boolean;
  },
): string {
  if (!detail) return "—";
  if (options?.soleVariant) return "—";
  if (typeName && detail.trim().toLowerCase() === typeName.trim().toLowerCase()) return "—";
  return detail;
}
