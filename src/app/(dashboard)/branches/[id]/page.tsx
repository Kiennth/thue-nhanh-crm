import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PeriodRevenueCards, ProductHighlightCards } from "@/components/dashboard-cards";
import { createClient } from "@/lib/supabase/server";
import {
  revenueForDay,
  revenueForMonth,
  revenueForYear,
  todayParts,
} from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";

// Dashboard riêng của 1 chi nhánh — giống trang chủ nhưng mọi số liệu (doanh
// thu, lượt thuê, giá vốn, thanh lý, tồn kho) đều lọc theo chi nhánh này.
export default async function BranchDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string; month?: string; year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const defaults = todayParts();
  const day = sp.day || defaults.day;
  const month = sp.month || defaults.month;
  const year = sp.year || defaults.year;

  const supabase = await createClient();

  const [
    { data: branch },
    { data: orders },
    { data: types },
    { data: units },
    { data: instances },
    { data: purchases },
    { data: disposals },
    { data: stock },
  ] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).single(),
    supabase.from("orders").select("id, order_date, total_value").eq("pickup_branch_id", id),
    supabase.from("equipment_types").select("id, name, product_type"),
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
  ]);

  if (!branch) {
    notFound();
  }

  const orderList = orders ?? [];
  const orderIds = orderList.map((o) => o.id);
  const { data: orderLines } = orderIds.length
    ? await supabase
        .from("order_equipment")
        .select("equipment_type_id, line_total")
        .in("order_id", orderIds)
    : { data: [] };

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
