import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRowsFast } from "@/lib/supabase/fetch-all";
import { vnNow } from "@/lib/vn-time";
import { buildPeriodOverview, toDateOnly, type DatedValue, type PeriodStat, type TrendPoint } from "@/lib/period-trend";

// Re-export để period-stat-cards.tsx / orders-trend-chart.tsx không phải đổi
// đường import khi logic tính toán chuyển sang period-trend.ts.
export type { PeriodStat, TrendPoint };

export interface OrdersOverview {
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  trend: {
    week: TrendPoint[];
    month: TrendPoint[];
    year: TrendPoint[];
  };
}

// Cần TOÀN BỘ đơn hoàn tất để tính thống kê/xu hướng theo thời gian — xu
// hướng 5 năm không date-bound được. ~10.000 dòng ≈ 11 trang, nên phân trang
// SONG SONG: bản tuần tự trước đây là một nửa nguyên nhân /orders sập 503
// (Worker exceeded resource limits) trên Cloudflare cho vai Giám đốc.
//
// CEO chốt 2026-08-08: đơn chưa hoàn thành không tính doanh số — chỉ lấy
// đơn có completed_at (đủ 10 khâu), số đơn/xu hướng ở đây đều là "đơn đã
// hoàn tất" (nhất quán toàn hệ thống, xem migration 20260808120000).
async function fetchCompletedOrders(branchId: string | null): Promise<DatedValue[]> {
  const supabase = await createClient();
  const orders = await fetchAllRowsFast<{ order_date: string; total_value: number }>(
    (from, to) => {
      let q = supabase
        .from("orders")
        .select("order_date, total_value")
        .is("cancelled_at", null)
        .not("completed_at", "is", null)
        .order("id")
        .range(from, to);
      if (branchId) {
        q = q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
      }
      return q;
    },
    () => {
      let q = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .is("cancelled_at", null)
        .not("completed_at", "is", null);
      if (branchId) {
        q = q.or(`pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`);
      }
      return q;
    },
  );
  return orders.map((o) => ({ date: o.order_date, value: o.total_value }));
}

// Thống kê + xu hướng đơn hàng theo tuần/tháng/năm — chỉ đơn ĐÃ HOÀN TẤT,
// không phụ thuộc bộ lọc trạng thái/thời gian của bảng danh sách (luôn là
// bức tranh toàn cảnh, chỉ giới hạn theo chi nhánh).
export async function computeOrdersOverview(
  branchId: string | null,
  now = vnNow(),
): Promise<OrdersOverview> {
  const orders = await fetchCompletedOrders(branchId);
  return buildPeriodOverview(orders, toDateOnly(now));
}
