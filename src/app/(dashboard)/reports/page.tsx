import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { vnDayKey, vnDayStartIso } from "@/lib/vn-day";
import { BranchComparisonSection, previousMonthOf } from "@/components/branch-comparison";
import { isProfitPeriod, type ProfitPeriod } from "@/lib/profit-period";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { todayParts } from "@/lib/dashboard-reports";
import { computeOrdersOverview } from "@/lib/orders-overview";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { expandRecurring } from "@/lib/recurring-expenses";
import { MANAGE_ROLES } from "@/lib/employee-performance-charts";
import { payrollByBranchForMonth } from "@/lib/report-cache";
import { PeriodStatCards } from "../orders/period-stat-cards";
import { OrdersTrendChart } from "../orders/orders-trend-chart";
import { CATEGORY_PERIODS, CategoryRevenue, type CategoryPeriod } from "./category-revenue";

// Trang "Báo cáo" (Grok tách gọn CRM 10/10, giai đoạn 1): so sánh doanh thu
// các kho + Lợi nhuận gộp chuyển khỏi Trang chủ — chỉ tính khi mở trang này.
// Quỹ lương theo tháng lấy từ bộ nhớ đệm report_cache (tháng đã qua 1 giờ,
// tháng này 15 phút). Giám đốc/Kế toán xem toàn hệ thống; Cửa hàng trưởng
// xem tổng quan đơn của kho mình. Admin không xem doanh thu (như cũ).
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    day?: string;
    month?: string;
    year?: string;
    profitPeriod?: string;
    tab?: string;
    period?: string;
    branch?: string;
  }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const canManage = (MANAGE_ROLES as readonly string[]).includes(employee.role);
  const canViewComparison = canManage && employee.role !== "admin";
  const isBranchManager = employee.role === "cua_hang_truong";
  if (!canViewComparison && !isBranchManager) redirect("/");

  const params = await searchParams;
  const defaults = todayParts();
  const day = params.day || defaults.day;
  const month = params.month || defaults.month;
  const year = params.year || defaults.year;
  const profitPeriod: ProfitPeriod =
    params.profitPeriod && isProfitPeriod(params.profitPeriod) ? params.profitPeriod : "month";

  // So sánh kho chỉ đọc đơn trong khoảng bao 3 mốc Ngày/Tháng/Năm đang chọn
  // (biên dưới lùi về 1/1 năm trước cho tab "Năm trước").
  const comparisonRangeStart = [`${day}`, `${month}-01`, `${Number(year) - 1}-01-01`].sort()[0];
  const comparisonRangeEndExclusive = (() => {
    const [y, m] = month.split("-").map(Number);
    const nextMonthOfMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const dayAfter = new Date(day);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);
    return [dayAfterStr, nextMonthOfMonth, `${Number(year) + 1}-01-01`].sort().reverse()[0];
  })();

  // Kỳ của khối Lợi nhuận gộp — Năm nay dừng ở tháng hiện tại (YTD).
  let profitMonths: string[] = [month];
  if (profitPeriod === "prevMonth") {
    profitMonths = [previousMonthOf(month)];
  } else if (profitPeriod === "year" || profitPeriod === "prevYear") {
    const profitYear = profitPeriod === "year" ? Number(year) : Number(year) - 1;
    const lastMonth = String(profitYear) === defaults.year ? Number(defaults.month.split("-")[1]) : 12;
    profitMonths = Array.from({ length: lastMonth }, (_, i) => `${profitYear}-${String(i + 1).padStart(2, "0")}`);
  }

  // Tab (giai đoạn 6, Grok 10/10 §7): Tổng quan (so sánh kho + lợi nhuận) ·
  // Theo nhóm hàng; Hoá đơn chưa xuất và Lương & khoán mở trang riêng có sẵn.
  const tab = params.tab === "category" ? "category" : "overview";
  const tabs = (
    <div className="flex flex-wrap gap-1 border-b">
      {[
        { href: "/reports", label: "Tổng quan", active: tab === "overview" },
        { href: "/reports?tab=category", label: "Theo nhóm hàng", active: tab === "category" },
        ...(canViewComparison
          ? [
              { href: "/invoices", label: "Hoá đơn chưa xuất ↗", active: false },
              { href: "/payroll", label: "Lương & khoán ↗", active: false },
            ]
          : []),
      ].map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            t.active
              ? "-mb-px border-b-2 border-primary px-3 py-2 text-sm font-semibold"
              : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "category") {
    const { data: branchRows } = await (await createClient()).from("branches").select("id, name").order("position");
    const lockBranch = !canViewComparison;
    const branchId = lockBranch
      ? (employee.branch_id ?? null)
      : (branchRows ?? []).some((b) => b.id === params.branch)
        ? params.branch!
        : null;
    const period = CATEGORY_PERIODS.some((p) => p.key === params.period)
      ? (params.period as CategoryPeriod)
      : "month";
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Báo cáo</h1>
        {tabs}
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl border bg-muted/40" />}>
          <CategoryRevenue
            period={period}
            today={defaults.day}
            branchId={branchId}
            branches={branchRows ?? []}
            lockBranch={lockBranch}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tabs}
      <div>
        <h1 className="text-2xl font-semibold">Báo cáo</h1>
        <p className="text-sm text-muted-foreground">
          {canViewComparison
            ? "Doanh thu theo kho và lợi nhuận gộp — quỹ lương tính sẵn, cập nhật 15 phút/lần cho tháng này."
            : "Tổng quan đơn hàng của kho bạn."}
        </p>
      </div>
      {canViewComparison && (
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border bg-muted/40" />}>
          <ComparisonBlock
            day={day}
            month={month}
            year={year}
            currentMonth={defaults.month}
            profitPeriod={profitPeriod}
            profitMonths={profitMonths}
            comparisonRangeStart={comparisonRangeStart}
            comparisonRangeEndExclusive={comparisonRangeEndExclusive}
          />
        </Suspense>
      )}
      {isBranchManager && employee.branch_id && (
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl border bg-muted/40" />}>
          <BranchOverview branchId={employee.branch_id} />
        </Suspense>
      )}
    </div>
  );
}

async function BranchOverview({ branchId }: { branchId: string }) {
  const overview = await computeOrdersOverview(branchId);
  return (
    <div className="space-y-4">
      <PeriodStatCards week={overview.week} month={overview.month} year={overview.year} />
      <OrdersTrendChart trend={overview.trend} />
    </div>
  );
}

async function ComparisonBlock({
  day,
  month,
  year,
  currentMonth,
  profitPeriod,
  profitMonths,
  comparisonRangeStart,
  comparisonRangeEndExclusive,
}: {
  day: string;
  month: string;
  year: string;
  currentMonth: string;
  profitPeriod: ProfitPeriod;
  profitMonths: string[];
  comparisonRangeStart: string;
  comparisonRangeEndExclusive: string;
}) {
  const supabase = await createClient();
  const nextMonthOf = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  };
  const [branchList, orders, payrollByMonth, periodExpensesRes, recurringDefsRes] = await Promise.all([
    supabase.from("branches").select("id, name").order("position"),
    fetchAllRows<{ pickup_branch_id: string; delivered_at: string; total_value: number }>((from, to) =>
      supabase
        .from("orders")
        .select("pickup_branch_id, delivered_at, total_value")
        // Doanh số = đơn ĐÃ GIAO, gồm VAT, ghi vào NGÀY GIAO (CEO 09/02 + 10/05).
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
    Promise.all(profitMonths.map((m) => payrollByBranchForMonth(m, currentMonth))),
    supabase
      .from("expenses")
      .select("branch_id, amount")
      .gte("expense_date", `${profitMonths[0]}-01`)
      .lt("expense_date", `${nextMonthOf(profitMonths[profitMonths.length - 1])}-01`),
    supabase.from("recurring_expenses").select("id, branch_id, category_id, amount, frequency, start_date, end_date, note"),
  ]);

  // Lợi nhuận gộp theo kho của KỲ đang chọn = doanh thu − chi phí vận hành
  // (expenses + khoản định kỳ trải theo tháng) − quỹ lương.
  const operatingByBranch = new Map<string, number>();
  for (const e of [...(periodExpensesRes.data ?? []), ...expandRecurring(recurringDefsRes.data ?? [], profitMonths)]) {
    operatingByBranch.set(e.branch_id, (operatingByBranch.get(e.branch_id) ?? 0) + Number(e.amount));
  }
  const payrollByBranch = new Map<string, number>();
  for (const monthMap of payrollByMonth) {
    for (const [branchId, amount] of Object.entries(monthMap)) {
      payrollByBranch.set(branchId, (payrollByBranch.get(branchId) ?? 0) + amount);
    }
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
