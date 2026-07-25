import { requireRole } from "@/lib/dal";
import { OrdersOverviewSection } from "./orders-overview-section";
import { OrdersListSection } from "./orders-list-section";

const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string; from?: string; to?: string; page?: string }>;
}) {
  const { status, range, from, to, page } = await searchParams;
  const employee = await requireRole(["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"]);
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
        branchId={branchId}
        canDelete={canManage}
      />
    </div>
  );
}
