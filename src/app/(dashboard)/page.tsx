import Link from "next/link";
import { BranchComparisonSection, previousMonthOf } from "@/components/branch-comparison";
import { isProfitPeriod, type ProfitPeriod } from "@/lib/profit-period";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { todayParts } from "@/lib/dashboard-reports";
import { vnNow } from "@/lib/vn-time";
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
  MANAGE_ROLES,
} from "@/lib/employee-performance-charts";
import { MyPerformanceCard } from "./my-performance-card";
import { MyPerformanceTrendCard } from "./my-performance-trend-card";
import { UpcomingDeliveriesCard, PendingCollectionsCard } from "./orders-to-handle-card";
import { OrdersToHandleRangeFilter } from "./orders-to-handle-range-filter";
import { OrdersToHandleLateToggle } from "./orders-to-handle-late-toggle";

// Trang chủ hiện tối đa 10 đơn mỗi khối "Đơn hàng sắp tới"/"Đơn hàng sắp về"
// (CEO chốt 2026-08-02, áp dụng cho mọi phân quyền).
const HANDLE_LIMIT = 10;

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
    profitPeriod?: string;
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
  const profitPeriod: ProfitPeriod =
    params.profitPeriod && isProfitPeriod(params.profitPeriod) ? params.profitPeriod : "month";
  const upcomingRangePreset: DateRangePreset =
    params.upcomingRange && isDateRangePreset(params.upcomingRange) ? params.upcomingRange : "all";
  const returningRangePreset: DateRangePreset =
    params.returningRange && isDateRangePreset(params.returningRange) ? params.returningRange : "all";
  const upcomingLateActive = params.upcomingLate === "1";
  const returningLateActive = params.returningLate === "1";
  const now = vnNow();
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
  // CEO chốt 2026-08-05: riêng khối "Đơn hàng sắp tới"/"sắp về" mở cho Cửa
  // hàng trưởng xem TOÀN HỆ THỐNG (không chỉ chi nhánh mình) — có thể cần
  // support chéo chi nhánh khác. Các khối khác (tổng quan đơn hàng chi
  // nhánh, so sánh chi nhánh...) vẫn dùng branchId như cũ, không đổi.
  // Kỹ thuật/Sales KHÔNG nằm trong diện này, vẫn chỉ thấy đúng chi nhánh
  // mình.
  const handleBranchId = canManage || isBranchManager ? null : employee.branch_id;
  // Trang chủ chỉ giữ chỉ số HIỆN THỜI (CEO chốt 2026-08-01): hiệu suất cá
  // nhân, đơn cần xử lý, so sánh chi nhánh tháng này. Các khối đếm tổng, cơ
  // cấu khách hàng, xếp hạng sản phẩm đã trả về đúng trang Khách hàng /
  // Thiết bị — bản cũ nạp ~50.000 dòng all-time chỉ để vẽ mấy khối đó, là
  // thứ khiến trang chủ Giám đốc mất 15s trên Cloudflare Workers.
  const canViewBranchComparison = canManage && employee.role !== "admin";

  // So sánh chi nhánh chỉ đọc lại các mốc Ngày/Tuần/Tháng/Năm/Năm-trước đang
  // chọn (lọc trong JS) — trước đây fetch NGUYÊN bảng orders all-time
  // (10.020 dòng, 11 lượt gọi tuần tự) chỉ để dùng mấy mốc đó. Biên dưới lùi
  // về 1/1 của NĂM TRƯỚC: nuôi tab "Năm trước", và tiện thể bao luôn tuần
  // vắt qua đầu năm (ngày 1-3/1 có thể thuộc tuần bắt đầu cuối tháng 12).
  const comparisonRangeStart = [`${day}`, `${month}-01`, `${Number(year) - 1}-01-01`].sort()[0];
  const comparisonRangeEndExclusive = (() => {
    const [y, m] = month.split("-").map(Number);
    const nextMonthOfMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const dayAfter = new Date(day);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);
    return [dayAfterStr, nextMonthOfMonth, `${Number(year) + 1}-01-01`].sort().reverse()[0];
  })();

  const supabase = await createClient();

  // Kỳ của khối Lợi nhuận gộp — Năm nay/Năm trước cộng dồn quỹ lương TỪNG
  // THÁNG (bậc thưởng chỉ có ý nghĩa xét theo tổng khoán TRONG THÁNG); Năm
  // hiện tại dừng ở tháng hiện tại (YTD) để khớp vế doanh thu và không cộng
  // trước chi phí định kỳ của tháng chưa tới.
  const nextMonthOf = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  };
  let profitMonths: string[] = [month];
  if (profitPeriod === "prevMonth") {
    profitMonths = [previousMonthOf(month)];
  } else if (profitPeriod === "year" || profitPeriod === "prevYear") {
    const profitYear = profitPeriod === "year" ? Number(year) : Number(year) - 1;
    const lastMonth =
      String(profitYear) === defaults.year ? Number(defaults.month.split("-")[1]) : 12;
    profitMonths = Array.from(
      { length: lastMonth },
      (_, i) => `${profitYear}-${String(i + 1).padStart(2, "0")}`,
    );
  }

  const [
    branchList,
    orders,
    ordersToHandle,
    myPerformance,
    payrollByMonth,
    myTrend,
    branchOrdersOverview,
  ] = await Promise.all([
    supabase.from("branches").select("id, name").order("position"),
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
    getOrdersToHandle(handleBranchId, HANDLE_LIMIT, {
      delivery: upcomingDateRange,
      collection: returningDateRange,
      lateOnly: { delivery: upcomingLateActive, collection: returningLateActive },
    }),
    computeMyPerformance(employee.id, employee.branch_id, employee.base_salary),
    // Chỉ khối Lợi nhuận gộp cần bảng lương theo tháng — khối Hiệu suất nhân
    // viên đã bỏ khỏi trang chủ (CEO chốt 2026-08-01: số liệu đủ đầy ở Bảng
    // lương rồi, không cần lặp lại).
    canViewBranchComparison
      ? Promise.all(profitMonths.map((m) => computeEmployeeMonthlyPerformance(m)))
      : Promise.resolve(null),
    // Xu hướng thu nhập cá nhân 6 tháng — chỉ cho nhân viên (quản lý đã có
    // khối biểu đồ hiệu suất toàn công ty riêng). Bỏ luôn cho Kỹ thuật/Sales:
    // tính 6 tháng payroll riêng lẻ quá nặng, kéo trang chủ chậm hẳn.
    canManage || employee.role === "ky_thuat_sales"
      ? Promise.resolve(null)
      : computeMyMonthlyTrend(employee.id),
    // Tổng quan đơn hàng (Tuần/Tháng/Năm + xu hướng) của RIÊNG chi nhánh mà
    // Cửa hàng trưởng phụ trách — Giám đốc đã có khối So sánh chi nhánh.
    isBranchManager && branchId
      ? computeOrdersOverview(branchId)
      : Promise.resolve(null),
  ]);

  // Lợi nhuận gộp theo chi nhánh của KỲ đang chọn = doanh thu − chi phí vận
  // hành (bảng expenses) − quỹ lương. payrollByMonth đã tính sẵn ở trên nên
  // ở đây chỉ cần gom chi phí + cộng quỹ lương theo chi nhánh.
  let branchProfit: {
    operatingByBranch: Map<string, number>;
    payrollByBranch: Map<string, number>;
  } | null = null;
  if (canViewBranchComparison) {
    const [{ data: periodExpenses }, { data: recurringDefs }] = await Promise.all([
      supabase
        .from("expenses")
        .select("branch_id, amount")
        .gte("expense_date", `${profitMonths[0]}-01`)
        .lt("expense_date", `${nextMonthOf(profitMonths[profitMonths.length - 1])}-01`),
      supabase
        .from("recurring_expenses")
        .select("id, branch_id, category_id, amount, frequency, start_date, end_date, note"),
    ]);
    const operatingByBranch = new Map<string, number>();
    // Khoản nhập tay + khoản định kỳ trải vào từng tháng của kỳ (thuê nhà,
    // trả góp...) — thiếu vế sau thì chi phí vận hành trên bảng lãi luôn 0.
    const periodOperatingRows = [
      ...(periodExpenses ?? []),
      ...expandRecurring(recurringDefs ?? [], profitMonths),
    ];
    for (const e of periodOperatingRows) {
      operatingByBranch.set(
        e.branch_id,
        (operatingByBranch.get(e.branch_id) ?? 0) + Number(e.amount),
      );
    }
    const payrollByBranch = new Map<string, number>();
    for (const r of (payrollByMonth ?? []).flat()) {
      if (!r.branchId) continue;
      payrollByBranch.set(r.branchId, (payrollByBranch.get(r.branchId) ?? 0) + r.totalIncome);
    }
    branchProfit = { operatingByBranch, payrollByBranch };
  }

  // "Thu nhập của bạn" + xu hướng theo tháng.
  const incomeSection = (
    <>
      <MyPerformanceCard perf={myPerformance} />
      {myTrend && <MyPerformanceTrendCard points={myTrend} />}
    </>
  );

  // "Đơn hàng sắp tới"/"sắp về" + tổng quan đơn hàng chi nhánh (Cửa hàng trưởng).
  const ordersSection = (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingDeliveriesCard
          orders={ordersToHandle.upcomingDeliveries}
          now={now}
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
          now={now}
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
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trang chủ</h1>
        <p className="text-sm text-muted-foreground">
          Xin chào, {employee.name} ({ROLE_LABELS[employee.role]})
        </p>
      </div>

      {/* CEO chốt 2026-08-05: Cửa hàng trưởng ưu tiên xem đơn hàng chi nhánh
          mình trước, "Thu nhập của bạn" đẩy xuống dưới — vai trò khác giữ
          nguyên thứ tự cũ (thu nhập trước, đơn hàng sau). */}
      {isBranchManager ? (
        <>
          {ordersSection}
          {incomeSection}
        </>
      ) : (
        <>
          {incomeSection}
          {ordersSection}
        </>
      )}

      {canViewBranchComparison && (
        <BranchComparisonSection
          branches={branchList.data ?? []}
          orders={orders}
          day={day}
          month={month}
          year={year}
          profit={branchProfit ?? undefined}
          profitPeriod={profitPeriod}
        />
      )}
    </div>
  );
}
