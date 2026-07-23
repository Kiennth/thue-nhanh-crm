import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodRevenueCards, ProductHighlightCards } from "@/components/dashboard-cards";
import { BranchComparisonSection } from "@/components/branch-comparison";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  revenueForDay,
  revenueForMonth,
  revenueForYear,
  todayParts,
} from "@/lib/dashboard-reports";
import { computeEquipmentTypeReports } from "@/lib/equipment-reports";
import { computeMyPerformance } from "@/lib/my-performance";
import { getOrdersToHandle } from "@/lib/orders-to-handle";
import { MyPerformanceCard } from "./my-performance-card";
import { UpcomingDeliveriesCard, PendingCollectionsCard } from "./orders-to-handle-card";
import { OrdersListSection } from "./orders/orders-list-section";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    day?: string;
    month?: string;
    year?: string;
    status?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const defaults = todayParts();
  const day = params.day || defaults.day;
  const month = params.month || defaults.month;
  const year = params.year || defaults.year;

  const employee = await getCurrentEmployee();

  // Trang chủ của nhân viên kỹ thuật/sales gộp luôn phần đơn hàng vào đây —
  // chỉ cần 1 điểm dừng chân duy nhất, không cần chuyển qua trang /orders
  // riêng. Không cần report toàn công ty/chi nhánh (đó là việc của quản
  // lý/kế toán).
  if (employee?.role === "ky_thuat_sales") {
    const [myPerformance, ordersToHandle] = await Promise.all([
      computeMyPerformance(employee.id, employee.branch_id, employee.base_salary),
      employee.branch_id
        ? getOrdersToHandle(employee.branch_id)
        : Promise.resolve({ upcomingDeliveries: [], pendingCollections: [] }),
    ]);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Trang chủ</h1>
          <p className="text-sm text-muted-foreground">
            Xin chào, {employee.name} ({ROLE_LABELS[employee.role]})
          </p>
        </div>

        <MyPerformanceCard perf={myPerformance} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UpcomingDeliveriesCard orders={ordersToHandle.upcomingDeliveries} />
          <PendingCollectionsCard orders={ordersToHandle.pendingCollections} />
        </div>

        <OrdersListSection
          status={params.status}
          range={params.range}
          from={params.from}
          to={params.to}
          branchId={employee.branch_id}
          canDelete={false}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const canCompareBranches = employee?.role === "admin" || employee?.role === "ke_toan";
  const canDeleteOrders = canCompareBranches;
  const [
    branches,
    branchList,
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
    ordersToHandle,
  ] = await Promise.all([
    supabase.from("branches").select("*", { count: "exact", head: true }),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("equipment_types").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("branch_id, order_date, total_value"),
    supabase.from("equipment_types").select("id, name, product_type"),
    supabase.from("equipment_units").select("id, equipment_type_id"),
    supabase
      .from("equipment_instances")
      .select("equipment_type_id, purchase_price, disposal_price, status"),
    supabase.from("equipment_purchases").select("equipment_unit_id, quantity, unit_cost"),
    supabase.from("equipment_disposals").select("equipment_unit_id, quantity, unit_price"),
    supabase.from("equipment_stock").select("equipment_unit_id, quantity_total"),
    supabase.from("order_equipment").select("equipment_type_id, line_total"),
    getOrdersToHandle(null),
  ]);

  const stats = [
    { label: "Chi nhánh", count: branches.count ?? 0, href: "/branches" },
    { label: "Khách hàng", count: customers.count ?? 0, href: "/customers" },
    { label: "Loại thiết bị", count: equipmentTypes.count ?? 0, href: "/equipment" },
  ];

  const orderList = orders ?? [];
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

  const myPerformance = employee
    ? await computeMyPerformance(employee.id, employee.branch_id, employee.base_salary)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trang chủ</h1>
        <p className="text-sm text-muted-foreground">
          Xin chào, {employee?.name} ({employee ? ROLE_LABELS[employee.role] : ""})
        </p>
      </div>

      {myPerformance && <MyPerformanceCard perf={myPerformance} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingDeliveriesCard orders={ordersToHandle.upcomingDeliveries} />
        <PendingCollectionsCard orders={ordersToHandle.pendingCollections} />
      </div>

      <OrdersListSection
        status={params.status}
        range={params.range}
        from={params.from}
        to={params.to}
        branchId={null}
        canDelete={canDeleteOrders}
      />

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

      {!canCompareBranches && (
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
      )}

      <ProductHighlightCards
        mostRented={mostRented.map((r) => ({ label: r.type.name, value: r.report.rentalCount }))}
        flagship={flagship.map((r) => ({ label: r.type.name, value: r.report.revenue }))}
        topMargin={topMargin.map((r) => ({
          label: r.type.name,
          value: (r.report.profitRatio ?? 0) * 100,
        }))}
      />

      {canCompareBranches && (
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
    </div>
  );
}
