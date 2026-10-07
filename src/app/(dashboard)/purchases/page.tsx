import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/dal";
import { SUPPLIER_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { vnTodayString } from "@/lib/vn-time";
import { cn } from "@/lib/utils";
import { NewPurchaseDialog } from "./new-purchase-dialog";
import { PURCHASE_STATUS, paymentState, vnd, type PurchaseStatus } from "./purchase-labels";

type Row = {
  id: string;
  code: string;
  order_date: string;
  status: PurchaseStatus;
  supplier_invoice_no: string | null;
  supplier_id: string;
  branch_id: string;
  suppliers: { name: string } | null;
  branches: { name: string } | null;
};

// Mua hàng từ NCC (CEO 2026-10-07): danh sách phiếu mua — lọc trạng thái, NCC.
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; supplier?: string; debt?: string }>;
}) {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const { status, supplier, debt } = await searchParams;
  const db = (await createClient()) as unknown as SupabaseClient;
  let q = db
    .from("purchase_orders")
    .select("id, code, order_date, status, supplier_invoice_no, supplier_id, branch_id, suppliers(name), branches(name)")
    .order("order_date", { ascending: false })
    .order("code", { ascending: false })
    .limit(500);
  if (status && status in PURCHASE_STATUS) q = q.eq("status", status);
  if (supplier) q = q.eq("supplier_id", supplier);
  const [{ data }, { data: totals }, { data: suppliers }, { data: branches }] = await Promise.all([
    q,
    db.from("purchase_order_totals").select("purchase_order_id, total, paid"),
    db.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    db.from("branches").select("id, name").order("name"),
  ]);
  const tot = new Map(
    ((totals ?? []) as { purchase_order_id: string; total: number; paid: number }[]).map((t) => [t.purchase_order_id, t]),
  );
  let rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    total: Number(tot.get(r.id)?.total ?? 0),
    paid: Number(tot.get(r.id)?.paid ?? 0),
  }));
  if (debt === "1") rows = rows.filter((r) => r.status !== "cancelled" && r.total - r.paid > 0);
  const owed = rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + Math.max(r.total - r.paid, 0), 0);
  const supplierName = supplier ? (suppliers ?? []).find((s) => s.id === supplier)?.name : null;

  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, supplier, debt, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/purchases?${s}` : "/purchases";
  };
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition",
      on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary hover:text-primary",
    );
  const lockBranch = employee.role === "cua_hang_truong";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mua hàng</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Mỗi lần mua máy / phụ kiện từ nhà cung cấp lập 1 phiếu: thêm hàng và giá → nhận hàng thì bấm <b>Nhập kho</b>{" "}
            (máy serial tự tạo kèm giá mua, hàng số lượng tự cộng tồn) → ghi các lần trả tiền NCC. Máy nào cũng truy ngược được
            mua của ai, ngày nào, giá bao nhiêu.
          </p>
        </div>
        <NewPurchaseDialog
          suppliers={suppliers ?? []}
          branches={branches ?? []}
          defaultBranchId={employee.branch_id ?? branches?.[0]?.id ?? ""}
          lockBranch={lockBranch}
          today={vnTodayString()}
          defaultSupplierId={supplier}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ status: undefined })} className={chip(!status)}>
          Tất cả
        </Link>
        {(Object.keys(PURCHASE_STATUS) as PurchaseStatus[]).map((s) => (
          <Link key={s} href={href({ status: s })} className={chip(status === s)}>
            {PURCHASE_STATUS[s].label}
          </Link>
        ))}
        <Link href={href({ debt: debt === "1" ? undefined : "1" })} className={chip(debt === "1")}>
          Còn nợ NCC
        </Link>
        {supplierName && (
          <Link href={href({ supplier: undefined })} className={chip(true)}>
            NCC: {supplierName} ✕
          </Link>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          Còn nợ NCC: <b className="text-foreground tabular-nums">{vnd(owed)}</b>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Chưa có phiếu mua nào{status || supplier || debt ? " khớp bộ lọc" : " — bấm “Tạo phiếu mua” để bắt đầu"}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phiếu</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>Kho</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead className="text-right">Đã trả</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ps = paymentState(r.total, r.paid);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/purchases/${r.id}`} className="font-semibold text-primary hover:underline">
                        {r.code}
                      </Link>
                      {r.supplier_invoice_no && <p className="text-xs text-muted-foreground">HĐ {r.supplier_invoice_no}</p>}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.order_date.split("-").reverse().join("/")}</TableCell>
                    <TableCell>{r.suppliers?.name}</TableCell>
                    <TableCell>{r.branches?.name}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{vnd(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vnd(r.paid)}
                      {r.status !== "cancelled" && <p className={cn("text-xs", ps.className)}>{ps.label}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PURCHASE_STATUS[r.status].className)}>
                        {PURCHASE_STATUS[r.status].label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
