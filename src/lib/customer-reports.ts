import { formatVNDate, vnNow, vnStartOfDay } from "@/lib/vn-time";
import type { CustomerType } from "@/types/database";

export interface CustomerReportRow {
  id: string;
  name: string;
  customerType: CustomerType;
  phone: string | null;
  orderCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalOwed: number;
  // Ngày đặt của đơn đầu tiên / gần nhất (chưa huỷ) — null nếu khách chưa
  // từng có đơn. Đơn đầu tiên chính là lúc khách "đến" với chi nhánh.
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}

// Khách "nguội": đã quen thuê (từ 2 đơn trở lên) nhưng lâu rồi không quay
// lại. Ngưỡng 90 ngày ~ 1 quý, đủ dài để không tính nhầm khách theo mùa vụ,
// đủ ngắn để gọi lại còn kịp.
export const DORMANT_DAYS = 90;
export const DORMANT_MIN_ORDERS = 2;

export function findDormantCustomers(
  rows: CustomerReportRow[],
  today = vnNow(),
): CustomerReportRow[] {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - DORMANT_DAYS);
  // KHÔNG dùng toISOString() ở đây — cutoff là Date "giả" (đã qua vnNow()),
  // giờ-trong-ngày còn sót lại có thể lệch qua ranh giới UTC. Đọc thẳng bằng
  // local getter (formatVNDate) mới đúng ngày VN.
  const cutoffStr = formatVNDate(cutoff);
  return rows
    .filter(
      (r) =>
        r.orderCount >= DORMANT_MIN_ORDERS && r.lastOrderDate !== null && r.lastOrderDate < cutoffStr,
    )
    // Gọi lại người từng chi nhiều nhất trước — đây là danh sách việc cần
    // làm, không phải bảng vinh danh, nên xếp theo mức đáng để bỏ công gọi.
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export interface ReturningRatePoint {
  month: string;
  // Số khách có đơn trong tháng, và trong đó bao nhiêu người đã từng thuê
  // trước tháng này. rate = null khi tháng đó không có khách nào (tránh chia
  // cho 0 và tránh vẽ điểm 0% giả).
  activeCount: number;
  returningCount: number;
  rate: number | null;
}

// So sánh THỜI ĐIỂM THẬT (không dùng vnNow() — epoch của nó đã bị dịch, cộng
// trừ trực tiếp sẽ sai) — quy "hôm nay" về đúng 00:00 giờ VN của ngày hôm
// nay rồi trừ epoch thật với dateStr.
export function daysSince(dateStr: string, todayReal: Date = new Date()): number {
  const startOfTodayVN = vnStartOfDay(formatVNDate(vnNow(todayReal)));
  return Math.floor((startOfTodayVN.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}

