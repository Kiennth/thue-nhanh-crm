"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePen, ReceiptText, Undo2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getInvoiceCopyText,
  markInvoiceIssued,
  markInvoicesDraft,
  markInvoicesNotNeeded,
  resetInvoiceStatus,
  type BulkResult,
} from "@/lib/actions/invoices";
import { DateInput } from "@/components/date-input";

export const NOT_NEEDED_PRESETS = [
  "Khách cá nhân không lấy hoá đơn",
  "Đã xuất gộp vào đơn khác",
  "Hoá đơn xuất bên Booqable / sổ cũ",
  "Đơn nội bộ / không thu tiền",
];

// Báo kết quả từng đơn của thao tác hàng loạt (Grok 10/10 §8.3).
export function reportBulk(label: string, res: BulkResult | { error: string }) {
  if ("error" in res) return toast.error(res.error);
  const ok = res.filter((r) => r.ok);
  const bad = res.filter((r) => !r.ok);
  if (ok.length) toast.success(`${label}: ${ok.map((r) => r.orderCode).join(", ")}`);
  for (const r of bad) toast.error(`${r.orderCode}: ${r.error ?? "lỗi"}`);
}

// Hộp "Không cần" — bắt buộc lý do, dùng cho 1 đơn hoặc nhiều đơn.
export function NotNeededDialog({
  orderIds,
  trigger,
  onDone,
}: {
  orderIds: string[];
  trigger: React.ReactElement;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      const res = await markInvoicesNotNeeded(orderIds, reason);
      reportBulk("Đã chuyển Không cần", res);
      if (!("error" in res)) {
        setOpen(false);
        onDone?.();
      }
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Không cần hoá đơn {orderIds.length > 1 ? `(${orderIds.length} đơn)` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="nn-reason">Lý do *</Label>
          <Input
            id="nn-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {NOT_NEEDED_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReason(p)}
                className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? "Đang lưu..." : "Xác nhận Không cần"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Thao tác từng đơn: Sao chép thông tin HĐ (dán sang MISA) · Nháp · Đã xuất
// (số HĐ + ngày) · Không cần (lý do) · Mở lại.
export function InvoiceRowActions({
  orderId,
  state,
  compact,
}: {
  orderId: string;
  state: "pending" | "draft" | "issued" | "not_needed";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleIssue(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await markInvoiceIssued(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        toast.success("Đã ghi nhận xuất hoá đơn.");
        setOpen(false);
      }
    });
  }

  const copy = () =>
    startTransition(async () => {
      const text = await getInvoiceCopyText(orderId);
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Đã sao chép thông tin xuất HĐ — dán sang MISA.");
      } catch {
        toast.error("Trình duyệt chặn sao chép.");
      }
    });

  if (state === "issued" || state === "not_needed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => resetInvoiceStatus(orderId))}
      >
        <Undo2 className="size-4" />
        Mở lại
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={copy} disabled={pending} title="Sao chép thông tin xuất HĐ">
        <ClipboardCopy className="size-4" />
        {!compact && "Sao chép"}
      </Button>
      {state === "pending" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              reportBulk("Đã đánh dấu Nháp", await markInvoicesDraft([orderId]));
            })
          }
        >
          <FilePen className="size-4" />
          Nháp
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button size="sm">
              <ReceiptText className="size-4" />
              Đã xuất
            </Button>
          }
        />
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ghi nhận đã xuất hoá đơn</DialogTitle>
          </DialogHeader>
          <form action={handleIssue} className="space-y-4">
            <input type="hidden" name="order_id" value={orderId} />
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Số hoá đơn</Label>
              <Input id="invoice_number" name="invoice_number" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issued_date">Ngày xuất</Label>
              <DateInput
                id="issued_date"
                name="issued_date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <NotNeededDialog
        orderIds={[orderId]}
        trigger={
          <Button variant="ghost" size="sm">
            <XCircle className="size-4" />
            {!compact && "Không cần"}
          </Button>
        }
      />
    </div>
  );
}
