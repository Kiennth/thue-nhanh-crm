import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueBarList, formatCount } from "@/components/revenue-bar-list";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { revenueByDay, revenueByWeek, revenueByMonth } from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";

export default async function DashboardHomePage() {
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

  const now = new Date();
  const orderList = orders ?? [];
  const dayPoints = revenueByDay(orderList, now, 14);
  const weekPoints = revenueByWeek(orderList, now, 8);
  const monthPoints = revenueByMonth(orderList, now, 6);

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
          <CardHeader>
            <CardTitle className="text-base">Doanh thu theo ngày (14 ngày qua)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList points={dayPoints} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doanh thu theo tuần (8 tuần qua)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList points={weekPoints} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doanh thu theo tháng (6 tháng qua)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBarList points={monthPoints} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
      </div>
    </div>
  );
}
