import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { matchWebOrderCustomers, type WebOrderItem } from "@/lib/actions/website-orders";
import { cn } from "@/lib/utils";
import { WebOrderCard, type WebOrderRow } from "./web-order-card";

// "Đơn web" (CEO 2026-10-04): yêu cầu đặt thuê khách gửi từ giỏ hàng
// thuenhanh.vn. Nhân viên trực: gọi xác nhận → "Lên đơn" (popup Tạo đơn
// nhanh điền sẵn hàng/ngày/kho/khách) → đơn web tự chuyển "Đã lên đơn".

const FILTERS = [
  { key: "open", label: "Cần xử lý", statuses: ["new", "contacted"] },
  { key: "converted", label: "Đã lên đơn", statuses: ["converted"] },
  { key: "cancelled", label: "Đã huỷ", statuses: ["cancelled"] },
  { key: "all", label: "Tất cả", statuses: ["new", "contacted", "converted", "cancelled"] },
] as const;

// Kho khách chọn trên web → chi nhánh CRM (theo tên chi nhánh).
const BRANCH_NAME_BY_KEY: Record<string, string> = { hn: "Hà Nội", hcm: "TP HCM", dn: "Đà Nẵng" };

export default async function WebOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole([...ALL_ROLES]);
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];

  const supabase = await createClient();
  // website_orders chưa có trong types/database.ts — client không ràng kiểu.
  const untyped = supabase as unknown as SupabaseClient;
  const [{ data: rows }, { data: branches }, { data: orderRows }] = await Promise.all([
    untyped
      .from("website_orders")
      .select("*")
      .in("status", [...filter.statuses])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("branches").select("id, name").order("position"),
    untyped.from("website_orders").select("status").in("status", ["new", "contacted"]),
  ]);

  const list = (rows ?? []) as (Omit<WebOrderRow, "items"> & { items: WebOrderItem[] })[];
  const openRows = list.filter((r) => r.status === "new" || r.status === "contacted");
  const matches = openRows.length
    ? await matchWebOrderCustomers(openRows.map((r) => ({ id: r.id, tax_code: r.tax_code, phone: r.phone })))
    : {};
  const branchList = branches ?? [];
  const branchIdByKey = (key: string | null) =>
    key ? (branchList.find((b) => b.name === BRANCH_NAME_BY_KEY[key])?.id ?? null) : null;
  const newCount = (orderRows ?? []).filter((r: { status: string }) => r.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Đơn web</h1>
          <p className="text-sm text-muted-foreground">
            Yêu cầu đặt thuê khách gửi từ giỏ hàng thuenhanh.vn — chưa giữ kho. Gọi xác nhận rồi bấm
            &quot;Lên đơn&quot;.
          </p>
        </div>
        <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Đơn hàng
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/orders/web" : `/orders/web?status=${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              f.key === filter.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {f.label}
            {f.key === "open" && newCount > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-xs text-white">{newCount} mới</span>
            )}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Không có đơn web nào ở mục này.
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <WebOrderCard
              key={r.id}
              row={r}
              branches={branchList}
              branchId={branchIdByKey(r.pickup_key === "ship" ? r.ship_city : r.pickup_key)}
              matchedCustomer={matches[r.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
