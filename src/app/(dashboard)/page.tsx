import Link from "next/link";
import { BranchComparisonSection } from "@/components/branch-comparison";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { todayParts } from "@/lib/dashboard-reports";
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
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
  // Trang chủ chỉ giữ chỉ số HIỆN THỜI (CEO chốt 2026-08-01): hiệu suất cá
  // nhân, đơn cần xử lý, so sánh chi nhánh tháng này. Các khối đếm tổng, cơ
  // cấu khách hàng, xếp hạng sản phẩm đã trả về đúng trang Khách hàng /
  // Thiết bị — bản cũ nạp ~50.000 dòng all-time chỉ để vẽ mấy khối đó, là
  // thứ khiến trang chủ Giám đốc mất 15s trên Cloudflare Workers.
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

  const [
    branchList,
    orders,
    ordersToHandle,
    myPerformance,
    employeeRows,
    myTrend,
    branchOrdersOverview,
  ] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
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
    getOrdersToHandle(branchId, HANDLE_LIMIT, {
      delivery: upcomingDateRange,
      collection: returningDateRange,
      lateOnly: { delivery: upcomingLateActive, collection: returningLateActive },
    }),
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
          orders={orders}
          day={day}
          month={month}
          year={year}
          isToday={day === defaults.day}
          isThisMonth={month === defaults.month}
          isThisYear={year === defaults.year}
          profit={branchProfit ?? undefined}
        />
      )}

      {canManage && employeeRows && (
        <EmployeePerformanceChartsSection rows={employeeRows} chartMonth={chartMonth} />
      )}
    </div>
  );
}
