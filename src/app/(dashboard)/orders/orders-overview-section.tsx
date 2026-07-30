import { getOrdersToHandle } from "@/lib/orders-to-handle";
import { computeOrdersOverview } from "@/lib/orders-overview";
import { UpcomingDeliveriesCard, PendingCollectionsCard } from "../orders-to-handle-card";
import { PeriodStatCards } from "./period-stat-cards";
import { OrdersTrendChart } from "./orders-trend-chart";

const HANDLE_LIMIT = 5;

// Toàn cảnh đơn hàng: quá khứ (xu hướng), hiện tại (thống kê kỳ này), tương
// lai (đơn sắp tới/sắp về), và dự đoán (chiếu theo tốc độ hiện tại cho phần
// còn lại của kỳ) — không phụ thuộc bộ lọc trạng thái/thời gian của bảng
// danh sách bên dưới.
export async function OrdersOverviewSection({
  branchId,
  showAggregates = true,
}: {
  branchId: string | null;
  // Kỹ thuật/Sales không được xem số liệu tổng hợp (doanh số kỳ, xu hướng) —
  // chỉ giữ 2 thẻ đơn sắp tới/sắp về là việc phải làm hằng ngày.
  showAggregates?: boolean;
}) {
  const [ordersToHandle, overview] = await Promise.all([
    getOrdersToHandle(branchId, HANDLE_LIMIT),
    showAggregates ? computeOrdersOverview(branchId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingDeliveriesCard orders={ordersToHandle.upcomingDeliveries} hideViewAllLink />
        <PendingCollectionsCard orders={ordersToHandle.pendingCollections} hideViewAllLink />
      </div>

      {overview && (
        <>
          <PeriodStatCards week={overview.week} month={overview.month} year={overview.year} />

          <OrdersTrendChart trend={overview.trend} />
        </>
      )}
    </div>
  );
}
