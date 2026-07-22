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

export const EQUIPMENT_SORT_OPTIONS = [
  { value: "name_asc", label: "Tên (A-Z)" },
  { value: "name_desc", label: "Tên (Z-A)" },
  { value: "price_desc", label: "Giá thuê (cao-thấp)" },
  { value: "price_asc", label: "Giá thuê (thấp-cao)" },
  { value: "updated_desc", label: "Mới cập nhật trước" },
  { value: "updated_asc", label: "Cũ nhất trước" },
] as const;

export type EquipmentSort = (typeof EQUIPMENT_SORT_OPTIONS)[number]["value"];
