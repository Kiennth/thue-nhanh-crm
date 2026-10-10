"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, FilePen, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markInvoicesDraft } from "@/lib/actions/invoices";
import { formatVND } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoiceRowActions, NotNeededDialog, reportBulk } from "./row-actions";

export type InvoiceRow = {
  id: string;
  orderCode: string;
  totalVat: number;
  completedAt: string | null;
  waitedMs: number;
  overdue: boolean;
  draftAt: string | null;
  issuedAt: string | null;
  invoiceNumber: string | null;
  notNeededReason: string | null;
  customer: {
    id: string;
    name: string;
    customer_type: string;
    tax_code: string | null;
    email: string | null;
    invoice_email: string | null;
    address: string | null;
  } | null;
  missing: string[];
};

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
const waited = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  return h < 24 ? `${h} giờ` : `${Math.floor(h / 24)} ngày`;
};

export function InvoiceQueueTable({ rows, view }: { rows: InvoiceRow[]; view: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const selectable = view !== "issued" && view !== "not_needed";
  const ids = [...selected];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const state = (r: InvoiceRow) =>
    r.issuedAt ? "issued" : view === "not_needed" ? "not_needed" : r.draftAt ? "draft" : "pending";

  return (
    <div className="space-y-2">
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <b>Đã chọn {selected.size} đơn</b>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                reportBulk("Đã đánh dấu Nháp", await markInvoicesDraft(ids));
                setSelected(new Set());
              })
            }
          >
            <FilePen className="size-4" />
            Đánh dấu Nháp ({selected.size})
          </Button>
          <NotNeededDialog
            orderIds={ids}
            onDone={() => setSelected(new Set())}
            trigger={
              <Button size="sm" variant="outline">
                <XCircle className="size-4" />
                Không cần… ({selected.size})
              </Button>
            }
          />
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs underline">
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
              )}
              <th className="px-3 py-2">Đơn</th>
              <th className="px-3 py-2">Bên mua</th>
              <th className="px-3 py-2">MST</th>
              <th className="px-3 py-2">Hoàn tất</th>
              <th className="px-3 py-2">{view === "issued" ? "Số HĐ / ngày" : "Đã chờ"}</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right">Tổng (VAT)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const st = state(r);
              return (
                <tr key={r.id} className={cn(selected.has(r.id) && "bg-primary/5")}>
                  {selectable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${r.orderCode}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/orders/${r.id}`} className="font-semibold text-primary hover:underline">
                      {r.orderCode}
                    </Link>
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    {r.customer ? (
                      <Link href={`/customers/${r.customer.id}`} className="line-clamp-1 hover:underline">
                        {r.customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {r.missing.length > 0 ? (
                      <Link
                        href={r.customer ? `/customers/${r.customer.id}` : "#"}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700 hover:underline dark:text-amber-300"
                      >
                        <AlertTriangle className="size-3" /> Thiếu {r.missing.join(", ")}
                      </Link>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        {r.customer?.invoice_email || r.customer?.email || ""}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.customer?.tax_code ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.completedAt ? dateFmt.format(new Date(r.completedAt)) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {view === "issued" ? (
                      <>
                        {r.invoiceNumber ?? "—"}
                        {r.issuedAt && (
                          <span className="block text-xs text-muted-foreground">
                            {dateFmt.format(new Date(r.issuedAt))}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5 tabular-nums">
                        {waited(r.waitedMs)}
                        {r.overdue && st !== "not_needed" && (
                          <span className="rounded bg-rose-600 px-1.5 text-[10.5px] font-bold text-white">QUÁ HẠN</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip state={st} />
                    {st === "not_needed" && r.notNeededReason && (
                      <span className="block max-w-56 truncate text-xs text-muted-foreground" title={r.notNeededReason}>
                        {r.notNeededReason}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">
                    {formatVND(r.totalVat)}
                  </td>
                  <td className="px-3 py-2">
                    <InvoiceRowActions orderId={r.id} state={st} compact />
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {view === "pending" ? "Không còn đơn nào chờ xuất hoá đơn." : "Không có đơn nào."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Chưa xuất", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  draft: { label: "Nháp", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  issued: { label: "Đã xuất", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  not_needed: { label: "Không cần", tone: "bg-muted text-muted-foreground" },
};

export function StatusChip({ state }: { state: string }) {
  const s = STATUS[state] ?? STATUS.pending;
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", s.tone)}>{s.label}</span>;
}
