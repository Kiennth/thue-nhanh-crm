import { Suspense } from "react";
import Link from "next/link";
import { vnDayKey, vnDayStartIso } from "@/lib/vn-day";
import { BranchComparisonSection, previousMonthOf } from "@/components/branch-comparison";
import { isProfitPeriod, type ProfitPeriod } from "@/lib/profit-period";
import { ROLE_LABELS, TECH_SALES_ROLES } from "@/lib/roles";
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
import { HomeKpiCards } from "./home-kpi-cards";

// Trang chủ hiện tối đa 10 đơn mỗi khối "Đơn hàng sắp tới"/"Đơn hàng sắp về"
// (CEO chốt 2026-08-02, áp dụng cho mọi phân quyền).
// Không cắt 10 đơn nữa (CEO 2026-10-06: "nhiều đơn quá") — khối tự cuộn
// trong chiều cao cố định (orders-to-handle-card.tsx), hiện đủ mọi đơn.
const HANDLE_LIMIT = undefined;

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
  // CEO chốt 2026-08-05: khối "Đơn hàng sắp tới"/"sắp về" mở TOÀN HỆ THỐNG
  // cho mọi role đăng nhập được (Cửa hàng trưởng lẫn Kỹ thuật/Sales đều có
  // thể cần support chéo chi nhánh khác) — không còn role nào bị scope theo
  // chi nhánh ở 2 khối này. Các khối khác (tổng quan đơn hàng chi nhánh, so
  // sánh chi nhánh...) vẫn dùng branchId như cũ, không đổi.
  const handleBranchId = null;
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

  // Kỳ của khối Lợi nhuận gộp — Năm nay/Năm trước cộng dồn quỹ lương TỪNG
  // THÁNG (bậc thưởng chỉ có ý nghĩa xét theo tổng khoán TRONG THÁNG); Năm
  // hiện tại dừng ở tháng hiện tại (YTD) để khớp vế doanh thu và không cộng
  // trước chi phí định kỳ của tháng chưa tới.
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

  const branchListPromise = createClient().then((supabase) =>
    supabase.from("branches").select("id, name").order("position"),
  );

  // Trang chủ STREAM theo khối (CEO 2026-10-09 "CRM vô chậm lắm" — trước chờ
  // CẢ 9 phần, gồm tính bảng lương toàn công ty cho Lợi nhuận gộp, mới hiện
  // trang ~3,5s): khung + từng khối tự hiện khi xong, khối chậm có khung chờ.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trang chủ</h1>
        <p className="text-sm text-muted-foreground">
          Xin chào, {employee.name} ({ROLE_LABELS[employee.role]})
        </p>
      </div>

      {/* CEO chốt 2026-08-08: "Thu nhập của bạn" xuống DƯỚI CÙNG trang chủ
          cho MỌI vai trò — đơn hàng và so sánh chi nhánh mới là thứ cần thấy
          ngay khi mở app. 4 thẻ KPI (đề xuất CRM v2) thay 2 thanh báo Đơn
          web / Thiếu hàng cũ; người không xem số tiền thấy "Hôm nay giao". */}
      <Suspense fallback={<BlockSkeleton className="h-28" />}>
        <HomeKpiCards branchId={branchId} canSeeMoney={canManage || isBranchManager} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-96" />}>
        <OrdersBlock
          handleBranchId={handleBranchId}
          upcomingDateRange={upcomingDateRange}
          returningDateRange={returningDateRange}
          upcomingLateActive={upcomingLateActive}
          returningLateActive={returningLateActive}
          upcomingRangePreset={upcomingRangePreset}
          returningRangePreset={returningRangePreset}
          now={now}
          branchOverviewId={isBranchManager && branchId ? branchId : null}
          branchListPromise={branchListPromise}
        />
      </Suspense>

      {canViewBranchComparison && (
        <Suspense fallback={<BlockSkeleton className="h-96" />}>
          <ComparisonBlock
            day={day}
            month={month}
            year={year}
            profitPeriod={profitPeriod}
            profitMonths={profitMonths}
            comparisonRangeStart={comparisonRangeStart}
            comparisonRangeEndExclusive={comparisonRangeEndExclusive}
            branchListPromise={branchListPromise}
          />
        </Suspense>
      )}

      <Suspense fallback={<BlockSkeleton className="h-40" />}>
        <IncomeBlock
          employeeId={employee.id}
          employeeBranchId={employee.branch_id}
          baseSalary={employee.base_salary}
          withTrend={!(canManage || TECH_SALES_ROLES.includes(employee.role))}
        />
      </Suspense>
    </div>
  );
}

function BlockSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border bg-muted/40 ${className ?? ""}`} />;
}

type BranchListPromise = Promise<{ data: { id: string; name: string }[] | null }>;

// "Đơn hàng sắp tới"/"sắp về" + tổng quan đơn hàng chi nhánh (Cửa hàng trưởng).
async function OrdersBlock({
  handleBranchId,
  upcomingDateRange,
  returningDateRange,
  upcomingLateActive,
  returningLateActive,
  upcomingRangePreset,
  returningRangePreset,
  now,
  branchOverviewId,
  branchListPromise,
}: {
  handleBranchId: string | null;
  upcomingDateRange: ReturnType<typeof computeDateRange>;
  returningDateRange: ReturnType<typeof computeDateRange>;
  upcomingLateActive: boolean;
  returningLateActive: boolean;
  upcomingRangePreset: DateRangePreset;
  returningRangePreset: DateRangePreset;
  now: Date;
  branchOverviewId: string | null;
  branchListPromise: BranchListPromise;
}) {
  const [ordersToHandle, branchOrdersOverview, branchList] = await Promise.all([
    getOrdersToHandle(handleBranchId, HANDLE_LIMIT, {
      delivery: upcomingDateRange,
      collection: returningDateRange,
      lateOnly: { delivery: upcomingLateActive, collection: returningLateActive },
    }),
    // Tổng quan đơn hàng (Tuần/Tháng/Năm + xu hướng) của RIÊNG chi nhánh mà
    // Cửa hàng trưởng phụ trách — Giám đốc đã có khối So sánh chi nhánh.
    branchOverviewId ? computeOrdersOverview(branchOverviewId) : Promise.resolve(null),
    branchListPromise,
  ]);
  return (
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
              Đơn hàng kho {branchList.data?.find((b) => b.id === branchOverviewId)?.name ?? ""}
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
}

// So sánh chi nhánh + Lợi nhuận gộp (Giám đốc/Kế toán) — phần NẶNG nhất
// (bảng lương toàn công ty theo tháng của kỳ) nên tải riêng, không chặn trang.
async function ComparisonBlock({
  day,
  month,
  year,
  profitPeriod,
  profitMonths,
  comparisonRangeStart,
  comparisonRangeEndExclusive,
  branchListPromise,
}: {
  day: string;
  month: string;
  year: string;
  profitPeriod: ProfitPeriod;
  profitMonths: string[];
  comparisonRangeStart: string;
  comparisonRangeEndExclusive: string;
  branchListPromise: BranchListPromise;
}) {
  const supabase = await createClient();
  const nextMonthOf = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  };
  const [branchList, orders, payrollByMonth, periodExpensesRes, recurringDefsRes] = await Promise.all([
    branchListPromise,
    fetchAllRows<{ pickup_branch_id: string; delivered_at: string; total_value: number }>((from, to) =>
      supabase
        .from("orders")
        .select("pickup_branch_id, delivered_at, total_value")
        // Đơn huỷ không phải doanh thu; doanh số ghi nhận khi ĐÃ GIAO HÀNG
        // và GỒM VAT (CEO 2026-09-02), ghi vào NGÀY GIAO (CEO 2026-10-05) —
        // order_date bên dưới là ngày giao giờ VN, giữ tên trường cho các hàm
        // revenueFor*. Chỉ lấy khoảng 3 mốc Ngày/Tháng/Năm đang chọn.
        .is("cancelled_at", null)
        .not("delivered_at", "is", null)
        .gte("delivered_at", vnDayStartIso(comparisonRangeStart))
        .lt("delivered_at", vnDayStartIso(comparisonRangeEndExclusive))
        .range(from, to),
    ).then((rows) =>
      rows.map((o) => ({
        pickup_branch_id: o.pickup_branch_id,
        order_date: vnDayKey(o.delivered_at),
        total_value: Math.round(o.total_value * 1.08 * 100) / 100,
      })),
    ),
    Promise.all(profitMonths.map((m) => computeEmployeeMonthlyPerformance(m))),
    supabase
      .from("expenses")
      .select("branch_id, amount")
      .gte("expense_date", `${profitMonths[0]}-01`)
      .lt("expense_date", `${nextMonthOf(profitMonths[profitMonths.length - 1])}-01`),
    supabase.from("recurring_expenses").select("id, branch_id, category_id, amount, frequency, start_date, end_date, note"),
  ]);

  // Lợi nhuận gộp theo chi nhánh của KỲ đang chọn = doanh thu − chi phí vận
  // hành (expenses + khoản định kỳ trải theo tháng) − quỹ lương.
  const operatingByBranch = new Map<string, number>();
  const periodOperatingRows = [
    ...(periodExpensesRes.data ?? []),
    ...expandRecurring(recurringDefsRes.data ?? [], profitMonths),
  ];
  for (const e of periodOperatingRows) {
    operatingByBranch.set(e.branch_id, (operatingByBranch.get(e.branch_id) ?? 0) + Number(e.amount));
  }
  const payrollByBranch = new Map<string, number>();
  for (const r of payrollByMonth.flat()) {
    if (!r.branchId) continue;
    payrollByBranch.set(r.branchId, (payrollByBranch.get(r.branchId) ?? 0) + r.totalIncome);
  }

  return (
    <BranchComparisonSection
      branches={branchList.data ?? []}
      orders={orders}
      day={day}
      month={month}
      year={year}
      profit={{ operatingByBranch, payrollByBranch }}
      profitPeriod={profitPeriod}
    />
  );
}

// "Thu nhập của bạn" + xu hướng 6 tháng (chỉ nhân viên — quản lý và Kỹ
// thuật/Sales không tính xu hướng vì nặng).
async function IncomeBlock({
  employeeId,
  employeeBranchId,
  baseSalary,
  withTrend,
}: {
  employeeId: string;
  employeeBranchId: string | null;
  baseSalary: number;
  withTrend: boolean;
}) {
  const [myPerformance, myTrend] = await Promise.all([
    computeMyPerformance(employeeId, employeeBranchId, baseSalary),
    withTrend ? computeMyMonthlyTrend(employeeId) : Promise.resolve(null),
  ]);
  return (
    <>
      <MyPerformanceCard perf={myPerformance} />
      {myTrend && <MyPerformanceTrendCard points={myTrend} />}
    </>
  );
}
