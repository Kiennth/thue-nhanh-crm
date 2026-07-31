import "server-only";
import type { DeliveryMethod } from "@/types/database";

// Hai hàm tính lương (bảng lương toàn công ty ở employee-performance-charts.ts
// và thẻ hiệu suất cá nhân ở my-performance.ts) đọc đúng cùng bộ cột này —
// gom về một chỗ để sửa cột là sửa cả hai, không lệch nhau.

export const ORDER_LINE_COLUMNS =
  "order_id, equipment_type_id, employee_id, completed_date, line_total, delivery_method";

export interface OrderLineRow {
  order_id: string;
  equipment_type_id: string | null;
  employee_id: string | null;
  completed_date: string | null;
  line_total: number;
  delivery_method: DeliveryMethod | null;
}

export const ORDER_COLUMNS = "id, total_value, pickup_branch_id, rental_start_at, rental_end_at";

export interface OrderRow {
  id: string;
  total_value: number;
  pickup_branch_id: string;
  rental_start_at: string | null;
  rental_end_at: string | null;
}
