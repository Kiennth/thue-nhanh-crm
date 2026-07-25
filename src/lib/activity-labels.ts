import { PAYMENT_METHOD_LABELS, TASK_TYPE_LABELS } from "@/lib/order-labels";
import type { PaymentMethod, TaskType } from "@/types/database";

// Danh sách bảng có gắn trigger log_activity (xem migration
// 20260725000000_activity_log.sql) — dùng cho dropdown lọc theo đối tượng.
export const ACTIVITY_TABLE_LABELS: Record<string, string> = {
  orders: "Đơn hàng",
  order_tasks: "Khâu xử lý đơn",
  order_payments: "Thanh toán",
  customers: "Khách hàng",
  employees: "Nhân viên",
  branches: "Chi nhánh",
  equipment_types: "Loại hàng hoá",
  equipment_instances: "Sản phẩm (theo dõi riêng lẻ)",
  equipment_stock: "Tồn kho",
  pricing_templates: "Bảng giá mẫu",
  commission_tiers: "Bậc hoa hồng",
  bonus_tiers: "Bậc thưởng",
  task_weights: "Trọng số khâu",
};

export const ACTIVITY_TABLE_OPTIONS = Object.entries(ACTIVITY_TABLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const ACTIVITY_ACTION_LABELS: Record<"insert" | "update" | "delete", string> = {
  insert: "Tạo mới",
  update: "Cập nhật",
  delete: "Xoá",
};

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Suy ra nhãn ngắn gọn để hiển thị từ snapshot jsonb (new_data khi còn tồn
// tại, old_data khi đã bị xoá) — mỗi bảng có 1 vài trường "tên" tự nhiên
// khác nhau nên không gộp chung logic được.
export function getActivityRecordLabel(
  tableName: string,
  data: Record<string, unknown> | null,
): string {
  if (!data) return "";

  switch (tableName) {
    case "orders":
      return typeof data.order_code === "string" ? data.order_code : "";
    case "order_tasks": {
      const taskType = data.task_type as TaskType | undefined;
      return taskType ? (TASK_TYPE_LABELS[taskType] ?? String(taskType)) : "";
    }
    case "order_payments": {
      const amount = typeof data.amount === "number" ? currencyFormatter.format(data.amount) + "đ" : "";
      const method = data.method as PaymentMethod | undefined;
      const methodLabel = method ? (PAYMENT_METHOD_LABELS[method] ?? String(method)) : "";
      return [amount, methodLabel].filter(Boolean).join(" · ");
    }
    case "customers":
    case "employees":
    case "branches":
    case "equipment_types":
    case "pricing_templates":
      return typeof data.name === "string" ? data.name : "";
    case "equipment_instances":
      return typeof data.identifier_code === "string" ? data.identifier_code : "";
    default:
      // equipment_stock, commission_tiers, bonus_tiers, task_weights: không
      // có tên tự nhiên, để trống — chỉ hiển thị tên bảng là đủ ở bản đầu.
      return "";
  }
}
