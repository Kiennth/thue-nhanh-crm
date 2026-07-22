import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueBarList, formatCount, formatPercent } from "@/components/revenue-bar-list";
import { PeriodPicker } from "@/components/period-picker";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { revenueForDay, revenueForMonth, revenueForYear } from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function formatDayLabel(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function todayParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { day: `${y}-${m}-${d}`, month: `${y}-${m}`, year: `${y}` };
}

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const defaults = todayParts();
  const day = params.day || defaults.day;
  const month = params.month || defaults.month;
  const year = params.year || defaults.year;

  const supabase = await createClient();
  const [
    employee,
    branches,
    customers,
    equipmentTypes,
    { data: orders },
    { data: types },
    { data: units },
    { data: instances },
    { data: purchases },
    { data: disposals },
    { data: stock },
    { data: orderLines },
  ] = await Promise.all([
    getCurrentEmployee(),
    supabase.from("branches").select("*", { count: "exact", head: true }),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("equipment_types").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("order_date, total_value"),
    supabase.from("equipment_types").select("id, name, product_type"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase
      .from("equipment_instances")
      .select("equipment_type_id, purchase_price, disposal_price, status"),
    supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
    supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
    supabase.from("equipment_stock").select("equipment_unit_id, quantity_total"),
    supabase.from("order_equipment").select("equipment_type_id, line_total"),
  ]);

  const stats = [
    { label: "Chi nhánh", count: branches.count ?? 0, href: "/branches" },
    { label: "Khách hàng", count: customers.count ?? 0, href: "/customers" },
    { label: "Loại thiết bị", count: equipmentTypes.count ?? 0, href: "/equipment" },
  ];

  const orderList = orders ?? [];
  const dayRevenue = revenueForDay(orderList, day);
  const monthRevenue = revenueForMonth(orderList, month);
  const yearRevenue = revenueForYear(orderList, year);

  const isToday = day === defaults.day;
  const isThisMonth = month === defaults.month;
  const isThisYear = year === defaults.year;

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
      <div>
        <h1 className="text-2xl font-semibold">Trang chủ</h1>
        <p className="text-sm text-muted-foreground">
          Xin chào, {employee?.name} ({employee ? ROLE_LABELS[employee.role] : ""})
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isToday ? "Doanh thu hôm nay" : `Doanh thu ngày ${formatDayLabel(day)}`}
            </CardTitle>
            <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{currencyFormatter.format(dayRevenue)}đ</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isThisMonth ? "Doanh thu tháng này" : `Doanh thu tháng ${month.split("-")[1]}/${month.split("-")[0]}`}
            </CardTitle>
            <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{currencyFormatter.format(monthRevenue)}đ</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {isThisYear ? "Doanh thu năm nay" : `Doanh thu năm ${year}`}
            </CardTitle>
            <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{currencyFormatter.format(yearRevenue)}đ</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cho thuê nhiều nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList
              points={mostRented.map((r) => ({ label: r.type.name, value: r.report.rentalCount }))}
              formatValue={formatCount}
              labelWidthClassName="w-32"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sản phẩm chủ lực (doanh thu cao nhất)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList
              points={flagship.map((r) => ({ label: r.type.name, value: r.report.revenue }))}
              labelWidthClassName="w-32"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tỉ suất lợi nhuận cao nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList
              points={topMargin.map((r) => ({ label: r.type.name, value: (r.report.profitRatio ?? 0) * 100 }))}
              formatValue={formatPercent}
              labelWidthClassName="w-32"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
