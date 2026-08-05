import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PeriodRevenueCards, ProductHighlightCards } from "@/components/dashboard-cards";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import {
  revenueForDay,
  revenueForMonth,
  revenueForYear,
  todayParts,
} from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";
import { computeOrdersOverview } from "@/lib/orders-overview";
import { PeriodStatCards } from "../../orders/period-stat-cards";
import { OrdersTrendChart } from "../../orders/orders-trend-chart";

// Dashboard riêng của 1 chi nhánh — giống trang chủ nhưng mọi số liệu (doanh
// thu, lượt thuê, giá vốn, thanh lý, tồn kho) đều lọc theo chi nhánh này.
export default async function BranchDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string; month?: string; year?: string }>;
}) {
  // Menu đã để mục này riêng cho Giám đốc, nhưng trang lại không chặn ai —
  // gõ thẳng URL là vào (cùng lỗ hổng đã vá ở /branches, xem branches/page.tsx).
  await requireRole([...DIRECTOR_ONLY]);

  const { id } = await params;
  const sp = await searchParams;
  const defaults = todayParts();
  const day = sp.day || defaults.day;
  const month = sp.month || defaults.month;
  const year = sp.year || defaults.year;

  const supabase = await createClient();

  const [
    { data: branch },
    orders,
    { data: types },
    { data: units },
    { data: instances },
    { data: purchases },
    { data: disposals },
    { data: stock },
    ordersOverview,
  ] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).single(),
    fetchAllRows<{ id: string; order_date: string; total_value: number }>((from, to) =>
      supabase
        .from("orders")
        .select("id, order_date, total_value")
        .eq("pickup_branch_id", id)
        .range(from, to),
    ),
    supabase.from("equipment_types").select("id, name, product_type, tracking_type"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase
      .from("equipment_instances")
      .select("equipment_type_id, purchase_price, disposal_price, status")
      .eq("branch_id", id),
    supabase
      .from("equipment_purchases")
      .select("equipment_unit_id, quantity, unit_cost")
      .eq("branch_id", id),
    supabase
      .from("equipment_disposals")
      .select("equipment_unit_id, quantity, unit_price")
      .eq("branch_id", id),
    supabase
      .from("equipment_stock")
      .select("equipment_unit_id, quantity_total")
      .eq("branch_id", id),
    computeOrdersOverview(id),
  ]);

  if (!branch) {
    notFound();
  }

  const orderList = orders;
  const orderIdSet = new Set(orderList.map((o) => o.id));
  // Không lọc order_equipment bằng .in(order_id, ...) — chi nhánh đông có thể
  // hàng nghìn đơn, danh sách IN dài cỡ đó dễ vượt giới hạn độ dài URL của
  // PostgREST. Lấy toàn bộ order_equipment (phân trang) rồi lọc ở JS.
  const allOrderLines = orderIdSet.size
    ? await fetchAllRows<{ order_id: string; equipment_type_id: string | null; line_total: number }>(
        (from, to) =>
          supabase
            .from("order_equipment")
            .select("order_id, equipment_type_id, line_total")
            .range(from, to),
      )
    : [];
  const orderLines = allOrderLines.filter((line) => orderIdSet.has(line.order_id));

  const typeList = types ?? [];
  const reports = computeEquipmentTypeReports(
    typeList,
    units ?? [],
    instances ?? [],
    purchases ?? [],
    disposals ?? [],
    stock ?? [],
    orderLines ?? [],
  );
  const rows = typeList.map((type) => ({ type, report: reports.get(type.id)! }));

  const mostRented = rows
    .filter((r) => r.type.product_type === "rental")
    .sort((a, b) => b.report.rentalCount - a.report.rentalCount)
    .filter((r) => r.report.rentalCount > 0)
    .slice(0, 5);

  const flagship = [...rows]
    .sort((a, b) => b.report.revenue - a.report.revenue)
    .filter((r) => r.report.revenue > 0)
    .slice(0, 5);

  const topMargin = rows
    .filter((r) => r.report.profitRatio !== null)
    .sort((a, b) => (b.report.profitRatio ?? 0) - (a.report.profitRatio ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{branch.name}</h1>
        <Badge variant={branch.is_active ? "default" : "secondary"}>
          {branch.is_active ? "Hoạt động" : "Ngừng"}
        </Badge>
      </div>

      <PeriodRevenueCards
        day={day}
        month={month}
        year={year}
        isToday={day === defaults.day}
        isThisMonth={month === defaults.month}
        isThisYear={year === defaults.year}
        dayRevenue={revenueForDay(orderList, day)}
        monthRevenue={revenueForMonth(orderList, month)}
        yearRevenue={revenueForYear(orderList, year)}
      />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Xu hướng đơn hàng</h2>
        <PeriodStatCards week={ordersOverview.week} month={ordersOverview.month} year={ordersOverview.year} />
        <OrdersTrendChart trend={ordersOverview.trend} />
      </div>

      <ProductHighlightCards
        mostRented={mostRented.map((r) => ({ label: r.type.name, value: r.report.rentalCount }))}
        flagship={flagship.map((r) => ({ label: r.type.name, value: r.report.revenue }))}
        topMargin={topMargin.map((r) => ({
          label: r.type.name,
          value: (r.report.profitRatio ?? 0) * 100,
        }))}
      />
    </div>
  );
}
