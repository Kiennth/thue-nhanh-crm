import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchRowsByIds } from "@/lib/supabase/fetch-all";
import { vnNow } from "@/lib/vn-time";
import {
  buildPeriodOverview,
  toDateOnly,
  type DatedValue,
  type PeriodStat,
  type TrendPoint,
} from "@/lib/period-trend";

export interface EquipmentRevenueOverview {
  allTime: { count: number; revenue: number };
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  trend: {
    week: TrendPoint[];
    month: TrendPoint[];
    year: TrendPoint[];
  };
}

// order_equipment không có cột ngày riêng — tra order_date từ orders để định
// nghĩa "doanh thu" NHẤT QUÁN với revenueForDay/Month/Year (dashboard-reports.ts)
// và computeOrdersOverview (orders-overview.ts): cả hai đều dùng order_date,
// KHÔNG dùng rental_start_at.
async function fetchOrderLinesForType(equipmentTypeId: string): Promise<DatedValue[]> {
  const supabase = await createClient();
  const lines = await fetchAllRows<{ order_id: string; line_total: number }>((from, to) =>
    supabase
      .from("order_equipment")
      .select("order_id, line_total")
      .eq("equipment_type_id", equipmentTypeId)
      .range(from, to),
  );
  if (!lines.length) return [];

  const orderIds = [...new Set(lines.map((l) => l.order_id))];
  const orders = await fetchRowsByIds<{ id: string; order_date: string }>(orderIds, (idChunk, from, to) =>
    supabase.from("orders").select("id, order_date").in("id", idChunk).range(from, to),
  );
  const orderDateById = new Map(orders.map((o) => [o.id, o.order_date]));

  const items: DatedValue[] = [];
  for (const line of lines) {
    const date = orderDateById.get(line.order_id);
    if (date) items.push({ date, value: line.line_total });
  }
  return items;
}

// Doanh thu theo tuần/tháng/năm/toàn bộ thời gian cho ĐÚNG 1 loại thiết bị —
// dùng ở tab "Doanh thu" trang chi tiết thiết bị.
export async function computeEquipmentRevenueOverview(
  equipmentTypeId: string,
  now = vnNow(),
): Promise<EquipmentRevenueOverview> {
  const items = await fetchOrderLinesForType(equipmentTypeId);
  const allTime = { count: items.length, revenue: items.reduce((sum, i) => sum + i.value, 0) };
  return { allTime, ...buildPeriodOverview(items, toDateOnly(now)) };
}
