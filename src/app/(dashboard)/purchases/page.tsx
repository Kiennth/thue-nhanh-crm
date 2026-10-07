import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CircleDollarSign, Clock, History, PackageCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/dal";
import { SUPPLIER_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { vnTodayString } from "@/lib/vn-time";
import { cn } from "@/lib/utils";
import { NewPurchaseDialog } from "./new-purchase-dialog";
import {
  KIND_BADGE,
  PURCHASE_STATUS,
  paymentState,
  statusLabel,
  vnd,
  type PurchaseKind,
  type PurchaseStatus,
} from "./purchase-labels";

type Row = {
  id: string;
  code: string;
  order_date: string;
  status: PurchaseStatus;
  kind: PurchaseKind;
  supplier_invoice_no: string | null;
  supplier_id: string;
  branch_id: string;
  suppliers: { name: string } | null;
  branches: { name: string } | null;
};

// Vạch màu đầu dòng theo trạng thái — nhìn lướt biết phiếu nào cần xử lý.
const STRIPE: Record<PurchaseStatus, string> = {
  draft: "border-l-slate-400",
  ordered: "border-l-amber-500",
  received: "border-l-emerald-500",
  cancelled: "border-l-rose-400",
};
const CHIP_ON: Record<string, string> = {
  all: "border-primary bg-primary text-primary-foreground",
  draft: "border-slate-500 bg-slate-600 text-white",
  ordered: "border-amber-500 bg-amber-500 text-white",
  received: "border-emerald-600 bg-emerald-600 text-white",
  cancelled: "border-rose-500 bg-rose-500 text-white",
  debt: "border-rose-600 bg-rose-600 text-white",
  backfill: "border-violet-600 bg-violet-600 text-white",
};
const CHIP_OFF: Record<string, string> = {
  all: "hover:border-primary hover:text-primary",
  draft: "border-slate-300 text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900",
  ordered: "border-amber-300 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40",
  received: "border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40",
  cancelled: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40",
  debt: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40",
  backfill: "border-violet-300 text-violet-800 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40",
};

// Mua hàng từ NCC (CEO 2026-10-07): danh sách phiếu mua — lọc trạng thái, NCC.
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; supplier?: string; debt?: string; kind?: string }>;
}) {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const { status, supplier, debt, kind } = await searchParams;
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data }, { data: totals }, { data: suppliers }, { data: branches }] = await Promise.all([
    db
      .from("purchase_orders")
      .select("id, code, order_date, status, kind, supplier_invoice_no, supplier_id, branch_id, suppliers(name), branches(name)")
      .order("order_date", { ascending: false })
      .order("code", { ascending: false })
      .limit(1000),
    db.from("purchase_order_totals").select("purchase_order_id, total, paid"),
    db.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    db.from("branches").select("id, name").order("name"),
  ]);
  const tot = new Map(
    ((totals ?? []) as { purchase_order_id: string; total: number; paid: number }[]).map((t) => [t.purchase_order_id, t]),
  );
  const all = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    total: Number(tot.get(r.id)?.total ?? 0),
    paid: Number(tot.get(r.id)?.paid ?? 0),
  }));
  const live = all.filter((r) => r.status !== "cancelled");
  const monthPrefix = vnTodayString().slice(0, 7);
  const stats = {
    waiting: all.filter((r) => r.status === "ordered").length,
    owed: live.reduce((s, r) => s + Math.max(r.total - r.paid, 0), 0),
    owedCount: live.filter((r) => r.total - r.paid > 0).length,
    month: all.filter((r) => r.status === "received" && r.kind === "new" && r.order_date.startsWith(monthPrefix)).reduce((s, r) => s + r.total, 0),
    backfill: all.filter((r) => r.kind === "backfill").length,
  };
  const rows = all.filter(
    (r) =>
      (!status || r.status === status) &&
      (!supplier || r.supplier_id === supplier) &&
      (!kind || r.kind === kind) &&
      (debt !== "1" || (r.status !== "cancelled" && r.total - r.paid > 0)),
  );
  const supplierName = supplier ? (suppliers ?? []).find((s) => s.id === supplier)?.name : null;

  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, supplier, debt, kind, ...p })) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/purchases?${s}` : "/purchases";
  };
  const chip = (key: string, on: boolean) =>
    cn("rounded-full border px-3 py-1 text-sm font-medium transition", on ? CHIP_ON[key] : CHIP_OFF[key]);

  const cards = [
    { icon: Clock, label: "Đang chờ hàng", value: `${stats.waiting} phiếu`, tone: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200", href: href({ status: "ordered", debt: undefined, kind: undefined }) },
    { icon: CircleDollarSign, label: "Còn nợ NCC", value: vnd(stats.owed), sub: `${stats.owedCount} phiếu`, tone: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200", href: href({ debt: "1", status: undefined, kind: undefined }) },
    { icon: PackageCheck, label: "Nhập kho tháng này", value: vnd(stats.month), tone: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200", href: href({ status: "received", debt: undefined, kind: "new" }) },
    { icon: History, label: "Phiếu ghi lại hàng có sẵn", value: `${stats.backfill} phiếu`, tone: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200", href: href({ kind: "backfill", status: undefined, debt: undefined }) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mua hàng</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            <b>Mua mới:</b> thêm hàng và giá → nhận hàng bấm <b>Nhập kho</b> (máy serial tự tạo kèm giá mua, hàng số lượng tự cộng
            tồn). <b>Ghi lại hàng đã có:</b> chọn máy đang có để gắn nhà cung cấp, giá và ngày mua. Ghi các lần trả tiền NCC để
            theo dõi công nợ.
          </p>
        </div>
        <NewPurchaseDialog
          suppliers={suppliers ?? []}
          branches={branches ?? []}
          defaultBranchId={employee.branch_id ?? branches?.[0]?.id ?? ""}
          lockBranch={employee.role === "cua_hang_truong"}
          today={vnTodayString()}
          defaultSupplierId={supplier}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={cn("rounded-xl border p-3 transition hover:shadow-sm", c.tone)}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
              <c.icon className="size-4" /> {c.label}
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums">{c.value}</p>
            {c.sub && <p className="text-xs opacity-75">{c.sub}</p>}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ status: undefined })} className={chip("all", !status)}>
          Tất cả
        </Link>
        {(Object.keys(PURCHASE_STATUS) as PurchaseStatus[]).map((s) => (
          <Link key={s} href={href({ status: status === s ? undefined : s })} className={chip(s, status === s)}>
            {PURCHASE_STATUS[s].label}
          </Link>
        ))}
        <Link href={href({ debt: debt === "1" ? undefined : "1" })} className={chip("debt", debt === "1")}>
          Còn nợ NCC
        </Link>
        <Link href={href({ kind: kind === "backfill" ? undefined : "backfill" })} className={chip("backfill", kind === "backfill")}>
          Ghi lại hàng có sẵn
        </Link>
        {supplierName && (
          <Link href={href({ supplier: undefined })} className={chip("all", true)}>
            NCC: {supplierName} ✕
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Chưa có phiếu mua nào{status || supplier || debt || kind ? " khớp bộ lọc" : " — bấm “Tạo phiếu mua” để bắt đầu"}.
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
                    <TableCell className={cn("border-l-4", STRIPE[r.status])}>
                      <Link href={`/purchases/${r.id}`} className="font-semibold text-primary hover:underline">
                        {r.code}
                      </Link>
                      <p className="mt-0.5">
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", KIND_BADGE[r.kind].className)}>
                          {KIND_BADGE[r.kind].label}
                        </span>
                      </p>
                      {r.supplier_invoice_no && <p className="text-xs text-muted-foreground">HĐ {r.supplier_invoice_no}</p>}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.order_date.split("-").reverse().join("/")}</TableCell>
                    <TableCell>
                      <Link href={href({ supplier: r.supplier_id })} className="hover:underline">
                        {r.suppliers?.name}
                      </Link>
                    </TableCell>
                    <TableCell>{r.branches?.name}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{vnd(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vnd(r.paid)}
                      {r.status !== "cancelled" && <p className={cn("text-xs font-semibold", ps.className)}>{ps.label}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", PURCHASE_STATUS[r.status].className)}>
                        {statusLabel(r.status, r.kind)}
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
