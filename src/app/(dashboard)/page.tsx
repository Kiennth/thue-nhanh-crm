import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductHighlightCards } from "@/components/dashboard-cards";
import { BranchComparisonSection } from "@/components/branch-comparison";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { todayParts } from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";
import { computeOrdersOverview } from "@/lib/orders-overview";
import { PeriodStatCards } from "./orders/period-stat-cards";
import { OrdersTrendChart } from "./orders/orders-trend-chart";
import { computeMyPerformance } from "@/lib/my-performance";
import { getOrdersToHandle } from "@/lib/orders-to-handle";
import {
  computeDateRange,
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
} from "@/lib/date-range-presets";
import { fetchAllCustomersLite } from "@/lib/customers";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildCustomerReportRows } from "@/lib/customer-reports";
import {
  computeEmployeeMonthlyPerformance,
  computeMyMonthlyTrend,
  currentMonth,
  MANAGE_ROLES,
} from "@/lib/employee-performance-charts";
import { MyPerformanceCard } from "./my-performance-card";
import { MyPerformanceTrendCard } from "./my-performance-trend-card";
import { UpcomingDeliveriesCard, PendingCollectionsCard } from "./orders-to-handle-card";
import { OrdersToHandleRangeFilter } from "./orders-to-handle-range-filter";
import { OrdersToHandleLateToggle } from "./orders-to-handle-late-toggle";
import { CustomerOverviewTiles } from "./customers/customer-report-section";
import { EmployeePerformanceChartsSection } from "./employee-performance-charts";

const HANDLE_LIMIT = 5;

function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESET_OPTIONS.map((o) => o.value) as string[]).includes(value);
}

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    day?: string;
    month?: string;
    year?: string;
    chartMonth?: string;
    upcomingRange?: string;
    returningRange?: string;
    upcomingLate?: string;
    returningLate?: string;
  }>;
}) {
  const params = await searchParams;
  const defaults = todayParts();
  const day = params.day || defaults.day;
  const month = params.month || defaults.month;
  const year = params.year || defaults.year;
  const chartMonth = params.chartMonth || currentMonth();
  const upcomingRangePreset: DateRangePreset =
    params.upcomingRange && isDateRangePreset(params.upcomingRange) ? params.upcomingRange : "all";
  const returningRangePreset: DateRangePreset =
    params.returningRange && isDateRangePreset(params.returningRange) ? params.returningRange : "all";
  const upcomingLateActive = params.upcomingLate === "1";
  const returningLateActive = params.returningLate === "1";
  const now = new Date();
  const upcomingDateRange = computeDateRange(upcomingRangePreset, now);
  const returningDateRange = computeDateRange(returningRangePreset, now);

  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const canManage = (MANAGE_ROLES as readonly string[]).includes(employee.role);
  const branchId = canManage ? null : employee.branch_id;
  // Cửa hàng trưởng thấy chỉ số ĐIỀU HÀNH của đúng chi nhánh mình (đơn hàng,
  // kho) — không thấy số liệu toàn hệ thống, cũng không thấy báo cáo khách
  // hàng (chỉ Giám đốc/Admin/Kế toán). Kỹ thuật/Sales không thấy gì.
  const isBranchManager = employee.role === "cua_hang_truong";

  const supabase = await createClient();

  let processingOrdersQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .is("completed_at", null)
    .is("cancelled_at", null);
  if (branchId) {
    processingOrdersQuery = processingOrdersQuery.or(
      `pickup_branch_id.eq.${branchId},return_branch_id.eq.${branchId}`,
    );
  }

  const [
    branches,
    branchList,
    customersCount,
    equipmentTypes,
    orders,
    { data: types },
    { data: units },
    { data: instances },
    { data: purchases },
    { data: disposals },
    { data: stock },
    orderLines,
    ordersToHandle,
    { count: processingCount },
    customersLite,
    customerOrders,
    customerPayments,
    myPerformance,
    employeeRows,
    myTrend,
    branchOrdersOverview,
  ] = await Promise.all([
    supabase.from("branches").select("*", { count: "exact", head: true }),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("equipment_types").select("*", { count: "exact", head: true }),
    fetchAllRows<{
      id: string;
      pickup_branch_id: string;
      return_branch_id: string;
      order_date: string;
      total_value: number;
    }>((from, to) =>
      supabase
        .from("orders")
        .select("id, pickup_branch_id, return_branch_id, order_date, total_value")
        .range(from, to),
    ),
    supabase.from("equipment_types").select("id, name, product_type"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase
      .from("equipment_instances")
      .select("equipment_type_id, purchase_price, disposal_price, status"),
    supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
    supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
    supabase.from("equipment_stock").select("equipment_unit_id, quantity_total, branch_id"),
    fetchAllRows<{ equipment_type_id: string | null; line_total: number; order_id: string }>(
      (from, to) =>
        supabase
          .from("order_equipment")
          .select("equipment_type_id, line_total, order_id")
          .range(from, to),
    ),
    getOrdersToHandle(branchId, HANDLE_LIMIT, {
      delivery: upcomingDateRange,
      collection: returningDateRange,
      lateOnly: { delivery: upcomingLateActive, collection: returningLateActive },
    }),
    processingOrdersQuery,
    fetchAllCustomersLite(),
    fetchAllRows<{
      id: string;
      customer_id: string;
      total_value: number;
      order_date: string;
      cancelled_at: string | null;
    }>((from, to) =>
      supabase
        .from("orders")
        .select("id, customer_id, total_value, order_date, cancelled_at")
        .range(from, to),
    ),
    fetchAllRows<{ order_id: string; amount: number }>((from, to) =>
      supabase.from("order_payments").select("order_id, amount").range(from, to),
    ),
    computeMyPerformance(employee.id, employee.branch_id, employee.base_salary),
    canManage ? computeEmployeeMonthlyPerformance(chartMonth) : Promise.resolve(null),
    // Xu hướng thu nhập cá nhân 6 tháng — chỉ cho nhân viên (quản lý đã có
    // khối biểu đồ hiệu suất toàn công ty riêng).
    canManage ? Promise.resolve(null) : computeMyMonthlyTrend(employee.id),
    // Tổng quan đơn hàng (Tuần/Tháng/Năm + xu hướng) của RIÊNG chi nhánh mà
    // Cửa hàng trưởng phụ trách — Giám đốc đã có khối So sánh chi nhánh.
    isBranchManager && branchId
      ? computeOrdersOverview(branchId)
      : Promise.resolve(null),
  ]);

  const stats = [
    { label: "Đơn hàng đang xử lý", count: processingCount ?? 0, href: "/orders" },
    { label: "Chi nhánh", count: branches.count ?? 0, href: "/branches" },
    { label: "Khách hàng", count: customersCount.count ?? 0, href: "/customers" },
    { label: "Loại thiết bị", count: equipmentTypes.count ?? 0, href: "/equipment" },
  ];

  const orderList = orders ?? [];
  const typeList = types ?? [];

  // Cửa hàng trưởng: chỉ tính báo cáo thiết bị trên kho + đơn hàng của đúng
  // chi nhánh mình (đơn tính cả chiều giao lẫn chiều thu hồi, khớp cách lọc
  // dùng chung ở /orders và getOrdersToHandle).
  const branchOrderIds = branchId
    ? new Set(
        orderList
          .filter((o) => o.pickup_branch_id === branchId || o.return_branch_id === branchId)
          .map((o) => o.id),
      )
    : null;
  const scopedStock = branchId
    ? (stock ?? []).filter((s) => s.branch_id === branchId)
    : (stock ?? []);
  const scopedOrderLines = branchOrderIds
    ? (orderLines ?? []).filter((l) => branchOrderIds.has(l.order_id))
    : (orderLines ?? []);

  const reports = computeEquipmentTypeReports(
    typeList,
    units ?? [],
    instances ?? [],
    purchases ?? [],
    disposals ?? [],
    scopedStock,
    scopedOrderLines,
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

  const customerReportRows = buildCustomerReportRows(
    customersLite ?? [],
    customerOrders ?? [],
    customerPayments ?? [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trang chủ</h1>
        <p className="text-sm text-muted-foreground">
          Xin chào, {employee.name} ({ROLE_LABELS[employee.role]})
        </p>
      </div>

      <MyPerformanceCard perf={myPerformance} />

      {myTrend && <MyPerformanceTrendCard points={myTrend} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingDeliveriesCard
          orders={ordersToHandle.upcomingDeliveries}
          hideViewAllLink
          rangeFilter={
            !upcomingLateActive && (
              <OrdersToHandleRangeFilter paramName="upcomingRange" value={upcomingRangePreset} />
            )
          }
          lateToggle={
            <OrdersToHandleLateToggle
              paramName="upcomingLate"
              count={ordersToHandle.lateDeliveriesCount}
              active={upcomingLateActive}
            />
          }
        />
        <PendingCollectionsCard
          orders={ordersToHandle.pendingCollections}
          hideViewAllLink
          rangeFilter={
            !returningLateActive && (
              <OrdersToHandleRangeFilter paramName="returningRange" value={returningRangePreset} />
            )
          }
          lateToggle={
            <OrdersToHandleLateToggle
              paramName="returningLate"
              count={ordersToHandle.lateCollectionsCount}
              active={returningLateActive}
            />
          }
        />
      </div>

      {/* Số liệu tổng quát toàn công ty — chỉ ban quản lý (giam_doc/admin/
          ke_toan) được xem; Sale/Kỹ thuật, Cửa hàng trưởng không thấy. */}
      {canManage && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.href} href={stat.href}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">{stat.count}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {canManage && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Khách hàng</h2>
            <Link href="/customers" className="text-xs text-muted-foreground hover:underline">
              Xem báo cáo đầy đủ →
            </Link>
          </div>
          <CustomerOverviewTiles rows={customerReportRows} />
        </div>
      )}

      {/* Cửa hàng trưởng: tổng quan đơn hàng của đúng chi nhánh mình. */}
      {branchOrdersOverview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Đơn hàng chi nhánh {branchList.data?.find((b) => b.id === branchId)?.name ?? ""}
            </h2>
            <Link href="/orders" className="text-xs text-muted-foreground hover:underline">
              Xem tất cả đơn →
            </Link>
          </div>
          <PeriodStatCards
            week={branchOrdersOverview.week}
            month={branchOrdersOverview.month}
            year={branchOrdersOverview.year}
          />
          <OrdersTrendChart trend={branchOrdersOverview.trend} />
        </div>
      )}

      {canManage && (
        <BranchComparisonSection
          branches={branchList.data ?? []}
          orders={orderList}
          day={day}
          month={month}
          year={year}
          isToday={day === defaults.day}
          isThisMonth={month === defaults.month}
          isThisYear={year === defaults.year}
        />
      )}

      {(canManage || isBranchManager) && (
        <ProductHighlightCards
          mostRented={mostRented.map((r) => ({ label: r.type.name, value: r.report.rentalCount }))}
          flagship={flagship.map((r) => ({ label: r.type.name, value: r.report.revenue }))}
          topMargin={topMargin.map((r) => ({
            label: r.type.name,
            value: (r.report.profitRatio ?? 0) * 100,
          }))}
        />
      )}

      {canManage && employeeRows && (
        <EmployeePerformanceChartsSection rows={employeeRows} chartMonth={chartMonth} />
      )}
    </div>
  );
}
