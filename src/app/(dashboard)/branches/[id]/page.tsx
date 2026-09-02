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

  // PeriodRevenueCards chỉ đọc đúng 3 mốc Ngày/Tháng/Năm đang chọn — chỉ cần
  // fetch đơn trong cửa sổ bao trùm 3 mốc đó (thường = đúng 1 năm), không kéo
  // cả lịch sử. Trang này từng tải 16,5s trên production (đo 2026-08-09) vì
  // kéo NGUYÊN bảng order_equipment 30k+ dòng + 5 bảng thiết bị rồi cộng dồn
  // bằng JS — phần đó giờ giao cho RPC equipment_page_report (cùng hàm đã chữa
  // /equipment, lọc theo p_branch_id, doanh thu chỉ đơn hoàn tất).
  const rangeStart = [`${day.slice(0, 4)}-01-01`, `${month.slice(0, 4)}-01-01`, `${year}-01-01`]
    .sort()[0];
  const rangeEnd = [`${day.slice(0, 4)}-12-31`, `${month.slice(0, 4)}-12-31`, `${year}-12-31`]
    .sort()
    .at(-1)!;

  const [
    { data: branch },
    orders,
    { data: types },
    { data: reportRows, error: reportError },
    ordersOverview,
  ] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).single(),
    // CEO chốt 2026-09-02: doanh thu tính đơn ĐÃ GIAO HÀNG, GỒM VAT (khớp
    // "Tổng doanh số" trang Đơn hàng).
    fetchAllRows<{ order_date: string; total_value: number }>((from, to) =>
      supabase
        .from("orders")
        .select("order_date, total_value")
        .eq("pickup_branch_id", id)
        .is("cancelled_at", null)
        .not("delivered_at", "is", null)
        .gte("order_date", rangeStart)
        .lte("order_date", rangeEnd)
        .range(from, to),
    ).then((rows) =>
      rows.map((o) => ({ ...o, total_value: Math.round(o.total_value * 1.08 * 100) / 100 })),
    ),
    supabase.from("equipment_types").select("id, name, product_type"),
    supabase.rpc("equipment_page_report", { p_branch_id: id, p_start: null, p_end: null }),
    computeOrdersOverview(id),
  ]);

  if (!branch) {
    notFound();
  }
  if (reportError) {
    throw new Error("Không tải được báo cáo thiết bị chi nhánh: " + reportError.message);
  }

  const orderList = orders;
  const typeList = types ?? [];
  const reportByTypeId = new Map((reportRows ?? []).map((r) => [r.equipment_type_id, r]));
  const rows = typeList.map((type) => ({ type, report: reportByTypeId.get(type.id) }));

  const mostRented = rows
    .filter((r) => r.type.product_type === "rental" && (r.report?.rental_count ?? 0) > 0)
    .sort((a, b) => (b.report?.rental_count ?? 0) - (a.report?.rental_count ?? 0))
    .slice(0, 5);

  const flagship = rows
    .filter((r) => (r.report?.revenue ?? 0) > 0)
    .sort((a, b) => (b.report?.revenue ?? 0) - (a.report?.revenue ?? 0))
    .slice(0, 5);

  const topMargin = rows
    .filter((r) => r.report?.profit_ratio != null)
    .sort((a, b) => (b.report?.profit_ratio ?? 0) - (a.report?.profit_ratio ?? 0))
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
        mostRented={mostRented.map((r) => ({ label: r.type.name, value: r.report?.rental_count ?? 0 }))}
        flagship={flagship.map((r) => ({ label: r.type.name, value: r.report?.revenue ?? 0 }))}
        topMargin={topMargin.map((r) => ({
          label: r.type.name,
          value: (r.report?.profit_ratio ?? 0) * 100,
        }))}
      />
    </div>
  );
}
