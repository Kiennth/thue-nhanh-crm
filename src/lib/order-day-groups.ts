import "server-only";
import { vnNow, formatVNDate } from "@/lib/vn-time";
import type { OrderToHandle } from "@/lib/orders-to-handle";

const WEEKDAY_LABELS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

export interface OrderDayGroup {
  dateStr: string;
  dateLabel: string;
  orders: OrderToHandle[];
}

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return "Hôm nay";
  if (dateStr === tomorrowStr) return "Ngày mai";
  // Đọc lại thứ/ngày/tháng của dateStr qua giờ trưa VN — tránh lệch ngày ở
  // biên UTC nếu dùng new Date(dateStr) trần (xem ghi chú trong vn-time.ts).
  const probe = vnNow(new Date(`${dateStr}T12:00:00+07:00`));
  return `${WEEKDAY_LABELS[probe.getDay()]}, ${probe.getDate()}/${probe.getMonth() + 1}`;
}

// Nhóm danh sách đơn (đã sắp theo actionDate tăng dần) thành từng cụm theo
// ngày lịch VN — học theo Booqable: chia "Hôm nay"/"Ngày mai"/"Thứ X, d/m"
// thay vì 1 danh sách phẳng dài.
export function groupOrdersByDay(orders: OrderToHandle[], nowVN: Date): OrderDayGroup[] {
  const todayStr = formatVNDate(nowVN);
  const tomorrow = new Date(nowVN);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatVNDate(tomorrow);

  const groups: OrderDayGroup[] = [];
  for (const order of orders) {
    const dateStr = formatVNDate(vnNow(new Date(order.actionDate)));
    const last = groups[groups.length - 1];
    if (last && last.dateStr === dateStr) {
      last.orders.push(order);
    } else {
      groups.push({ dateStr, dateLabel: dayLabel(dateStr, todayStr, tomorrowStr), orders: [order] });
    }
  }
  return groups;
}
