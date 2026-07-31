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
import { fetchAllRows, fetchAllRowsFast } from "@/lib/supabase/fetch-all";
import { buildCustomerReportRows } from "@/lib/customer-reports";
import { expandRecurring } from "@/lib/recurring-expenses";
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
  // Trang chủ cắt theo 2 mức, CEO chốt 2026-08-01:
  //   - Hai cụm ĐẾM tổng quát (đơn/chi nhánh/khách/loại thiết bị, cơ cấu
  //     khách hàng) và XẾP HẠNG SẢN PHẨM: chỉ Giám đốc. Xếp hạng sản phẩm đã
  //     có đủ trong báo cáo ở trang Thiết bị nên không lặp lại ngoài này.
  //   - So sánh doanh thu chi nhánh: thêm Kế toán, vì đây chính là số liệu
  //     bán hàng/cho thuê họ tổng hợp để báo cáo lên Giám đốc.
  const canViewDirectorSummary = employee.role === "giam_doc";
  const canViewBranchComparison = canManage && employee.role !== "admin";

  // So sánh chi nhánh chỉ đọc lại đúng 3 mốc Ngày/Tháng/Năm đang chọn
  // (revenueForDay/Month/Year lọc trong JS) — trước đây fetch NGUYÊN bảng
  // orders all-time (10.020 dòng, 11 lượt gọi tuần tự) chỉ để dùng 3 mốc đó.
  // Lấy khoảng bao trọn cả 3 mốc (thường cùng 1 năm, nhưng người dùng có thể
  // chọn ngày/tháng khác năm với ô Năm) — cắt còn đúng phần dữ liệu cần.
  const comparisonRangeStart = [`${day}`, `${month}-01`, `${year}-01-01`].sort()[0];
  const comparisonRangeEndExclusive = (() => {
    const [y, m] = month.split("-").map(Number);
    const nextMonthOfMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const dayAfter = new Date(day);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);
    return [dayAfterStr, nextMonthOfMonth, `${Number(year) + 1}-01-01`].sort().reverse()[0];
  })();

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
    // Mỗi nguồn dưới đây chỉ nuôi đúng một khối, nên bám theo đúng cờ của
    // khối đó. Ai không xem được thì đừng nạp: hàng chục nghìn dòng, và trên
    // Cloudflare Workers nạp thừa cỡ này chính là thứ đã làm sập trang với
    // lỗi 1102.
    canViewBranchComparison
      ? fetchAllRows<{ pickup_branch_id: string; order_date: string; total_value: number }>(
          (from, to) =>
            supabase
              .from("orders")
              .select("pickup_branch_id, order_date, total_value")
              // Đơn huỷ không phải doanh thu — trước đây thiếu điều kiện này
              // (chưa lệch số vì hệ thống hiện có 0 đơn huỷ, nhưng lãi/lỗ
              // thì phải đúng từ gốc).
              .is("cancelled_at", null)
              // BranchComparisonSection chỉ đọc lại đúng 3 mốc Ngày/Tháng/
              // Năm đang chọn — trước đây fetch NGUYÊN bảng orders all-time
              // (10.020 dòng) chỉ để dùng khoảng này.
              .gte("order_date", comparisonRangeStart)
              .lt("order_date", comparisonRangeEndExclusive)
              .range(from, to),
        )
      : Promise.resolve([]),
    canViewDirectorSummary
      ? supabase.from("equipment_types").select("id, name, product_type")
      : Promise.resolve({ data: null }),
    canViewDirectorSummary
      ? supabase.from("equipment_units").select("id, equipment_type_id")
      : Promise.resolve({ data: null }),
    canViewDirectorSummary
      ? supabase
          .from("equipment_instances")
          .select("equipment_type_id, purchase_price, disposal_price, status")
      : Promise.resolve({ data: null }),
    canViewDirectorSummary
      ? supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost")
      : Promise.resolve({ data: null }),
    canViewDirectorSummary
      ? supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price")
      : Promise.resolve({ data: null }),
    canViewDirectorSummary
      ? supabase.from("equipment_stock").select("equipment_unit_id, quantity_total")
      : Promise.resolve({ data: null }),
    // Xếp hạng sản phẩm CỐ Ý là all-time (không date-bound được như So sánh
    // chi nhánh) — bảng này 30.000+ dòng nên dùng bản phân trang song song
    // thay vì fetchAllRows tuần tự (đo trên trang Thiết bị: cùng truy vấn,
    // tuần tự mất 14s).
    canViewDirectorSummary
      ? fetchAllRowsFast<{ equipment_type_id: string | null; line_total: number }>(
          (from, to) =>
            supabase.from("order_equipment").select("equipment_type_id, line_total").order("id").range(from, to),
          () => supabase.from("order_equipment").select("*", { count: "exact", head: true }),
        )
      : Promise.resolve([]),
    getOrdersToHandle(branchId, HANDLE_LIMIT, {
      delivery: upcomingDateRange,
      collection: returningDateRange,
      lateOnly: { delivery: upcomingLateActive, collection: returningLateActive },
    }),
    processingOrdersQuery,
    // Ba nguồn này chỉ để dựng 4 ô "Khách hàng" — nay chỉ Giám đốc xem.
    canViewDirectorSummary ? fetchAllCustomersLite() : Promise.resolve([]),
    // Cần TOÀN BỘ lịch sử để phân loại khách mới/quay lại đúng nghĩa (dựa
    // trên đơn đầu tiên của khách, không giới hạn theo kỳ) — không date-bound
    // được, nên cắt thời gian chờ bằng cách phân trang song song thay vì
    // tuần tự (10.020 dòng ≈ 11 trang).
    canViewDirectorSummary
      ? fetchAllRowsFast<{
          id: string;
          customer_id: string;
          total_value: number;
          order_date: string;
          cancelled_at: string | null;
        }>(
          (from, to) =>
            supabase
              .from("orders")
              .select("id, customer_id, total_value, order_date, cancelled_at")
              .order("id")
              .range(from, to),
          () => supabase.from("orders").select("*", { count: "exact", head: true }),
        )
      : Promise.resolve([]),
    canViewDirectorSummary
      ? fetchAllRows<{ order_id: string; amount: number }>((from, to) =>
          supabase.from("order_payments").select("order_id, amount").range(from, to),
        )
      : Promise.resolve([]),
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

  // Lãi gộp theo chi nhánh của THÁNG đang so sánh = doanh thu − chi phí vận
  // hành (bảng expenses) − quỹ lương (tự lấy từ Bảng lương, CEO chốt). Chỉ
  // tính khi người xem thấy khối So sánh chi nhánh.
  let branchProfit: {
    operatingByBranch: Map<string, number>;
    payrollByBranch: Map<string, number>;
  } | null = null;
  if (canViewBranchComparison) {
    const [my, mm] = month.split("-").map(Number);
    const nextMonth = mm === 12 ? `${my + 1}-01` : `${my}-${String(mm + 1).padStart(2, "0")}`;
    const [{ data: monthExpenses }, { data: recurringDefs }, payrollRows] = await Promise.all([
      supabase
        .from("expenses")
        .select("branch_id, amount")
        .gte("expense_date", `${month}-01`)
        .lt("expense_date", `${nextMonth}-01`),
      supabase
        .from("recurring_expenses")
        .select("id, branch_id, category_id, amount, frequency, start_date, end_date, note"),
      // Tháng so sánh trùng tháng biểu đồ hiệu suất (mặc định) thì dùng lại
      // kết quả đã tính, khỏi chạy lại cả cụm truy vấn lương.
      month === chartMonth && employeeRows
        ? Promise.resolve(employeeRows)
        : computeEmployeeMonthlyPerformance(month),
    ]);
    const operatingByBranch = new Map<string, number>();
    // Khoản nhập tay + khoản định kỳ trải vào đúng tháng này (thuê nhà,
    // trả góp...) — thiếu vế sau thì chi phí vận hành trên bảng lãi luôn 0.
    const monthOperatingRows = [
      ...(monthExpenses ?? []),
      ...expandRecurring(recurringDefs ?? [], [month]),
    ];
    for (const e of monthOperatingRows) {
      operatingByBranch.set(
        e.branch_id,
        (operatingByBranch.get(e.branch_id) ?? 0) + Number(e.amount),
      );
    }
    const payrollByBranch = new Map<string, number>();
    for (const r of payrollRows) {
      if (!r.branchId) continue;
      payrollByBranch.set(r.branchId, (payrollByBranch.get(r.branchId) ?? 0) + r.totalIncome);
    }
    branchProfit = { operatingByBranch, payrollByBranch };
  }
  // Chỉ Giám đốc/Admin/Kế toán xem khối "Cho thuê nhiều nhất / Sản phẩm chủ
  // lực / Tỉ suất lợi nhuận" ở trang chủ nên báo cáo này luôn ở phạm vi toàn
  // hệ thống — Cửa hàng trưởng xem bản theo kho chi nhánh ở trang Thiết bị.
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

      {/* Bốn ô đếm tổng quát toàn công ty — chỉ Giám đốc. */}
      {canViewDirectorSummary && (
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

      {canViewDirectorSummary && (
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

      {canViewBranchComparison && (
        <BranchComparisonSection
          branches={branchList.data ?? []}
          orders={orderList}
          day={day}
          month={month}
          year={year}
          isToday={day === defaults.day}
          isThisMonth={month === defaults.month}
          isThisYear={year === defaults.year}
          profit={branchProfit ?? undefined}
        />
      )}

      {canViewDirectorSummary && (
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
