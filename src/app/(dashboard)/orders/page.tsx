import { requireRole } from "@/lib/dal";
import { ALL_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { OrdersOverviewSection } from "./orders-overview-section";
import { OrdersListSection } from "./orders-list-section";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    sort?: string;
    dir?: string;
    search?: string;
  }>;
}) {
  const { status, range, from, to, page, sort, dir, search } = await searchParams;
  const employee = await requireRole([...ALL_ROLES]);
  const canManage = (MANAGE_ROLES as readonly string[]).includes(employee.role);
  const branchId = canManage ? null : employee.branch_id;

  return (
    <div className="space-y-6">
      <OrdersOverviewSection branchId={branchId} />
      <OrdersListSection
        status={status}
        range={range}
        from={from}
        to={to}
        page={page}
        sort={sort}
        dir={dir}
        search={search}
        branchId={branchId}
        canDelete={canManage}
      />
    </div>
  );
}
