"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePen, ReceiptText, Undo2 } from "lucide-react";
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
  resetInvoiceStatus,
  type BulkResult,
} from "@/lib/actions/invoices";
import { DateInput } from "@/components/date-input";

// Báo kết quả từng đơn của thao tác hàng loạt (Grok 10/10 §8.3).
export function reportBulk(label: string, res: BulkResult | { error: string }) {
  if ("error" in res) return toast.error(res.error);
  const ok = res.filter((r) => r.ok);
  const bad = res.filter((r) => !r.ok);
  if (ok.length) toast.success(`${label}: ${ok.map((r) => r.orderCode).join(", ")}`);
  for (const r of bad) toast.error(`${r.orderCode}: ${r.error ?? "lỗi"}`);
}

// Thao tác từng đơn: Sao chép thông tin HĐ (dán sang MISA) · Nháp · Đã xuất
// (số HĐ + ngày) · Mở lại. Bỏ "Không cần" (CEO 2026-10-11: đơn nào cũng
// xuất hoá đơn); đơn "Không cần" cũ vẫn có Mở lại.
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
    </div>
  );
}
