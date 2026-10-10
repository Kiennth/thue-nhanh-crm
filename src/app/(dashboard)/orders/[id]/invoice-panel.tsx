"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccentTitle, accentCard, accentHeader } from "@/components/section-accent";
import { setOrderInvoiceNeeded } from "@/lib/actions/invoices";
import { InvoiceRowActions } from "../../invoices/row-actions";
import { StatusChip } from "../../invoices/invoice-queue-table";

const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" });

// Khung Hoá đơn trên chi tiết đơn (Grok tách gọn CRM 10/10 §8.1, giai đoạn 5):
// trạng thái Chưa xuất → Nháp → Đã xuất / Không cần, thông tin bên mua (báo
// thiếu MST / địa chỉ / email nhận HĐ), hạn xuất = hoàn tất + 24h. Trước khi
// hoàn tất: chọn đơn có cần HĐ không (mặc định theo khách).
export function InvoicePanel({
  orderId,
  completedAt,
  cancelled,
  invoice,
  customer,
  canManage,
}: {
  orderId: string;
  completedAt: string | null;
  cancelled: boolean;
  invoice: {
    needed: boolean | null;
    issuedAt: string | null;
    number: string | null;
    notNeeded: boolean;
    notNeededReason: string | null;
    draftAt: string | null;
  };
  customer: {
    id: string;
    name: string;
    customer_type: string;
    wants_vat: boolean;
    tax_code: string | null;
    address: string | null;
    email: string | null;
    invoice_email: string | null;
  } | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (cancelled) return null;
  const defaultNeeded = customer ? customer.customer_type === "company" || customer.wants_vat : true;
  const effectiveNeeded = invoice.needed ?? defaultNeeded;
  const state = invoice.issuedAt
    ? "issued"
    : invoice.notNeeded
      ? "not_needed"
      : !completedAt
        ? null
        : invoice.draftAt
          ? "draft"
          : "pending";
  const missing: string[] = [];
  if (effectiveNeeded) {
    if (!customer?.tax_code) missing.push("MST");
    if (!customer?.address) missing.push("địa chỉ");
    if (!customer?.invoice_email && !customer?.email) missing.push("email nhận HĐ");
  }
  const due = completedAt ? new Date(new Date(completedAt).getTime() + 86_400_000) : null;

  const setNeeded = (v: string) =>
    startTransition(async () => {
      const res = await setOrderInvoiceNeeded(orderId, v === "auto" ? null : v === "yes");
      if (res && "error" in res) toast.error(res.error);
    });

  return (
    <Card className={accentCard("violet")}>
      <CardHeader className={accentHeader("violet", "flex-row items-center justify-between")}>
        <CardTitle className="text-base">
          <AccentTitle accent="violet" icon={ReceiptText}>
            Hoá đơn
          </AccentTitle>
        </CardTitle>
        {state ? (
          <StatusChip state={state} />
        ) : (
          <span className="text-xs text-muted-foreground">
            {effectiveNeeded ? "Cần HĐ — vào hàng chờ khi hoàn tất" : "Không cần HĐ"}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!completedAt && (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Đơn này cần hoá đơn?</span>
            <select
              value={invoice.needed === null ? "auto" : invoice.needed ? "yes" : "no"}
              onChange={(e) => setNeeded(e.target.value)}
              disabled={pending}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="auto">Theo khách ({defaultNeeded ? "cần" : "không cần"})</option>
              <option value="yes">Cần</option>
              <option value="no">Không cần</option>
            </select>
          </label>
        )}

        {effectiveNeeded && customer && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Bên mua</dt>
            <dd>{customer.name}</dd>
            <dt className="text-muted-foreground">MST</dt>
            <dd className="tabular-nums">{customer.tax_code ?? "—"}</dd>
            <dt className="text-muted-foreground">Địa chỉ</dt>
            <dd>{customer.address ?? "—"}</dd>
            <dt className="text-muted-foreground">Email nhận HĐ</dt>
            <dd className="break-all">{customer.invoice_email || customer.email || "—"}</dd>
          </dl>
        )}
        {missing.length > 0 && customer && (
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 hover:underline dark:bg-amber-950/40 dark:text-amber-100"
          >
            <AlertTriangle className="size-3.5" /> Thiếu {missing.join(", ")} — bấm để bổ sung ở trang khách
          </Link>
        )}

        {state === "issued" && (
          <p>
            Số HĐ <b>{invoice.number || "—"}</b> · ngày {invoice.issuedAt ? dateFmt.format(new Date(invoice.issuedAt)) : "—"}
          </p>
        )}
        {state === "not_needed" && (
          <p className="text-muted-foreground">Lý do: {invoice.notNeededReason || "—"}</p>
        )}
        {state === "draft" && invoice.draftAt && (
          <p className="text-muted-foreground">Đã soạn nháp {dateTimeFmt.format(new Date(invoice.draftAt))}</p>
        )}
        {(state === "pending" || state === "draft") && due && (
          <p className="text-muted-foreground">Hạn xuất: {dateTimeFmt.format(due)} (hoàn tất + 24 giờ)</p>
        )}

        {canManage && state && (
          <div className="flex justify-end">
            <InvoiceRowActions orderId={orderId} state={state} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
