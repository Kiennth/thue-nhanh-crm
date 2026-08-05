import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, MANAGE_ROLES } from "@/lib/roles";
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
    scope?: string;
  }>;
}) {
  const { status, range, from, to, page, sort, dir, search, scope } = await searchParams;
  const employee = await requireRole([...ALL_ROLES]);
  const canManage = (MANAGE_ROLES as readonly string[]).includes(employee.role);
  const branchId = canManage ? null : employee.branch_id;

  // Cửa hàng trưởng: mặc định chỉ thấy đơn kho mình để tập trung đúng việc,
  // nhưng chủ động chuyển sang "tất cả chi nhánh" khi cần xem/hỗ trợ kho
  // khác (RLS đã cho đọc — xem 20260731000000_branch_manager_reads_all_orders).
  const isBranchManager = employee.role === "cua_hang_truong";
  const viewingAllBranches = isBranchManager && scope === "all";
  // CEO chốt 2026-08-05: Kỹ thuật/Sales xem đơn TOÀN HỆ THỐNG luôn (không
  // cần bật/tắt như Cửa hàng trưởng) — RLS đã cho đọc, xem
  // 20260805120000_ky_thuat_sales_reads_all_orders.sql.
  const isTechSales = employee.role === "ky_thuat_sales";
  const listBranchId = viewingAllBranches || isTechSales ? null : branchId;
  // Kỹ thuật/Sales không được xem số liệu tổng hợp (doanh số, xu hướng) —
  // Cửa hàng trưởng vẫn xem được vì số đã scope theo chi nhánh của họ.
  const canViewAggregates = employee.role !== "ky_thuat_sales";

  // Tên kho để ghi thẳng vào ô chọn phạm vi ("Kho Hà Nội") thay vì chữ chung
  // chung — chỉ cần khi có ô chọn đó.
  let branchName: string | null = null;
  if (isBranchManager && branchId) {
    const supabase = await createClient();
    const { data } = await supabase.from("branches").select("name").eq("id", branchId).maybeSingle();
    branchName = data?.name ?? null;
  }

  return (
    <div className="space-y-6">
      <OrdersListSection
        status={status}
        range={range}
        from={from}
        to={to}
        page={page}
        sort={sort}
        dir={dir}
        search={search}
        branchId={listBranchId}
        canDelete={canManage}
        // Mở rộng ra toàn hệ thống thì ẩn dãy thẻ thống kê: cửa hàng trưởng
        // được XEM đơn kho khác để hỗ trợ, nhưng không được đọc tổng quan
        // toàn công ty (tổng đơn, tổng doanh số) — đúng ranh giới CEO đặt.
        showStats={canViewAggregates && !viewingAllBranches}
        branchScope={
          isBranchManager && branchName
            ? { value: viewingAllBranches ? "all" : "branch", branchName }
            : undefined
        }
      />
    </div>
  );
}
