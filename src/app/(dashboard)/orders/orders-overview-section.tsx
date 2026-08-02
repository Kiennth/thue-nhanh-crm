import { computeOrdersOverview } from "@/lib/orders-overview";
import { PeriodStatCards } from "./period-stat-cards";
import { OrdersTrendChart } from "./orders-trend-chart";

// Toàn cảnh đơn hàng: quá khứ (xu hướng) + hiện tại (thống kê kỳ này) — không
// phụ thuộc bộ lọc trạng thái/thời gian của bảng danh sách bên dưới. Hai thẻ
// "Đơn sắp tới/sắp về" đã bỏ khỏi trang này (CEO chốt 2026-08-02): trang chủ
// hiện y hệt (tối đa 10 đơn/thẻ) cho mọi role rồi, để cả hai nơi là trùng lặp.
export async function OrdersOverviewSection({ branchId }: { branchId: string | null }) {
  const overview = await computeOrdersOverview(branchId);

  return (
    <div className="space-y-4">
      <PeriodStatCards week={overview.week} month={overview.month} year={overview.year} />

      <OrdersTrendChart trend={overview.trend} />
    </div>
  );
}
