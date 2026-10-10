import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { formatVND } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoiceQueueTable, type InvoiceRow } from "./invoice-queue-table";

// Hàng đợi hoá đơn (Grok tách gọn CRM 10/10, giai đoạn 5; sổ cũ CEO 09/02):
// đơn HOÀN TẤT cần hoá đơn tự vào "Chờ xuất", xếp đơn chờ lâu nhất lên đầu;
// hạn xuất = hoàn tất + 24h. Khách cá nhân không lấy VAT tự "Không cần" (có
// lý do). Trạng thái: Chưa xuất → Nháp → Đã xuất, hoặc Không cần.
// MISA meInvoice để sau — tạm "Sao chép thông tin HĐ" để dán sang MISA.
const VIEWS = [
  { key: "pending", label: "Chờ xuất" },
  { key: "overdue", label: "Quá hạn" },
  { key: "draft", label: "Nháp" },
  { key: "missing", label: "Thiếu thông tin" },
  { key: "not_needed", label: "Không cần" },
  { key: "issued", label: "Đã xuất" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const SELECT =
  "id, order_code, total_value, completed_at, pickup_branch_id, invoice_issued_at, invoice_number, invoice_draft_at, invoice_not_needed_reason, customers(id, name, customer_type, tax_code, email, invoice_email, address)";
const DAY = 86_400_000;
// Trang máy chủ, render theo từng request — giờ lúc tải trang.
const requestTime = () => Date.now();

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; branch?: string }>;
}) {
  await requireRole([...MANAGE_ROLES]);
  const params = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === params.filter) ? (params.filter as ViewKey) : "pending";

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: branches } = await supabase.from("branches").select("id, name").order("position");
  const branchId = (branches ?? []).some((b) => b.id === params.branch) ? params.branch! : null;
  const branchMatch: Record<string, string> = branchId ? { pickup_branch_id: branchId } : {};

  const [pendingRes, notNeededRes, issuedRes] = await Promise.all([
    supabase
      .from("orders")
      .select(SELECT)
      .match(branchMatch)
      .not("completed_at", "is", null)
      .is("cancelled_at", null)
      .is("invoice_issued_at", null)
      .eq("invoice_not_needed", false)
      .order("completed_at", { ascending: true })
      .limit(1000),
    view === "not_needed"
      ? supabase
          .from("orders")
          .select(SELECT, { count: "exact" })
          .match(branchMatch)
          .not("completed_at", "is", null)
          .is("cancelled_at", null)
          .is("invoice_issued_at", null)
          .eq("invoice_not_needed", true)
          .gte("completed_at", "2026-10-01")
          .order("completed_at", { ascending: false })
          .limit(200)
      : supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .match(branchMatch)
          .not("completed_at", "is", null)
          .is("cancelled_at", null)
          .is("invoice_issued_at", null)
          .eq("invoice_not_needed", true)
          .gte("completed_at", "2026-10-01"),
    view === "issued"
      ? supabase
          .from("orders")
          .select(SELECT, { count: "exact" })
          .match(branchMatch)
          .not("invoice_issued_at", "is", null)
          .order("invoice_issued_at", { ascending: false })
          .limit(200)
      : supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .match(branchMatch)
          .not("invoice_issued_at", "is", null),
  ]);

  const now = requestTime();
  const toRow = (o: Record<string, unknown>): InvoiceRow => {
    const c = o.customers as InvoiceRow["customer"];
    const completed = o.completed_at ? new Date(o.completed_at as string).getTime() : now;
    const missing: string[] = [];
    if (c?.customer_type === "company" || c?.tax_code) {
      if (!c?.tax_code) missing.push("MST");
      if (!c?.address) missing.push("địa chỉ");
      if (!c?.invoice_email && !c?.email) missing.push("email nhận HĐ");
    }
    return {
      id: o.id as string,
      orderCode: o.order_code as string,
      totalVat: Math.round(Number(o.total_value) * 1.08),
      completedAt: (o.completed_at as string) ?? null,
      waitedMs: Math.max(0, now - completed),
      overdue: now - completed > DAY,
      draftAt: (o.invoice_draft_at as string) ?? null,
      issuedAt: (o.invoice_issued_at as string) ?? null,
      invoiceNumber: (o.invoice_number as string) ?? null,
      notNeededReason: (o.invoice_not_needed_reason as string) ?? null,
      customer: c,
      missing,
    };
  };
  const pending = (pendingRes.data ?? []).map(toRow);
  const counts: Record<ViewKey, number> = {
    pending: pending.length,
    overdue: pending.filter((r) => r.overdue).length,
    draft: pending.filter((r) => r.draftAt).length,
    missing: pending.filter((r) => r.missing.length).length,
    not_needed: notNeededRes.count ?? 0,
    issued: issuedRes.count ?? 0,
  };
  // Cùng mốc với thẻ "Chưa xuất HĐ > 2 ngày" ở Hôm nay (today_board).
  const over2Days = pending.filter(
    (r) => r.completedAt && r.completedAt >= "2026-10-01" && r.waitedMs > 2 * DAY,
  ).length;
  const pendingValue = pending.reduce((s, r) => s + r.totalVat, 0);

  const rows =
    view === "pending"
      ? pending
      : view === "overdue"
        ? pending.filter((r) => r.overdue)
        : view === "draft"
          ? pending.filter((r) => r.draftAt)
          : view === "missing"
            ? pending.filter((r) => r.missing.length)
            : view === "not_needed"
              ? ((notNeededRes as { data?: Record<string, unknown>[] }).data ?? []).map(toRow)
              : ((issuedRes as { data?: Record<string, unknown>[] }).data ?? []).map(toRow);

  const href = (patch: { filter?: string; branch?: string | null }) => {
    const p = new URLSearchParams();
    const f = patch.filter ?? view;
    const b = patch.branch === undefined ? branchId : patch.branch;
    if (f !== "pending") p.set("filter", f);
    if (b) p.set("branch", b);
    const q = p.toString();
    return q ? `/invoices?${q}` : "/invoices";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Chờ xuất hoá đơn</h1>
          <p className="text-sm text-muted-foreground">
            Đơn hoàn tất cần hoá đơn tự vào đây, chờ lâu nhất lên đầu — hạn xuất 24 giờ sau khi hoàn tất.
          </p>
        </div>
        <div className="flex gap-1">
          {[{ id: null as string | null, name: "Tất cả" }, ...(branches ?? [])].map((b) => (
            <Link
              key={b.id ?? "all"}
              href={href({ branch: b.id })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                branchId === b.id ? "border-foreground/40 bg-muted" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {b.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap divide-x rounded-xl border bg-card text-sm">
        <Kpi label="Chờ xuất" value={String(counts.pending)} />
        <Kpi label="Quá hạn (> 24h)" value={String(counts.overdue)} tone={counts.overdue ? "rose" : undefined} />
        <Kpi label="Quá 2 ngày (Hôm nay)" value={String(over2Days)} tone={over2Days ? "rose" : undefined} />
        <Kpi label="Thiếu thông tin" value={String(counts.missing)} tone={counts.missing ? "amber" : undefined} />
        <Kpi label="Giá trị chờ xuất (gồm VAT)" value={formatVND(pendingValue)} />
      </div>

      <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href({ filter: v.key })}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              view === v.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {v.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                view === v.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
              )}
            >
              {counts[v.key]}
            </span>
          </Link>
        ))}
      </div>

      <InvoiceQueueTable key={`${view}-${branchId ?? ""}`} rows={rows} view={view} />

      <p className="text-xs text-muted-foreground">
        Đơn nào cũng xuất hoá đơn — không về công ty thì về cá nhân. Kế toán
        nhận chuông khi đơn quá hạn 24h, Giám đốc khi quá 3 ngày. Đơn hoàn tất trước 01/10/2026 đã đánh dấu hàng loạt.
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "rose" | "amber" }) {
  return (
    <div className="min-w-36 flex-1 px-4 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "rose" && "text-rose-700 dark:text-rose-300",
          tone === "amber" && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </p>
    </div>
  );
}
