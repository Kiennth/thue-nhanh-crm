"use client";

import { useState, useTransition } from "react";
import { ReceiptText, Undo2, XCircle } from "lucide-react";
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
  markInvoiceIssued,
  markInvoiceNotNeeded,
  resetInvoiceStatus,
} from "@/lib/actions/invoices";

// Nút thao tác từng dòng sổ hoá đơn: "Đã xuất" mở dialog lưu số HĐ + ngày;
// "Không cần" cho khách lẻ; "Mở lại" đưa về danh sách chờ khi bấm nhầm.
export function InvoiceRowActions({
  orderId,
  state,
}: {
  orderId: string;
  state: "pending" | "issued" | "not_needed";
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
        setOpen(false);
      }
    });
  }

  if (state !== "pending") {
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
    <div className="flex items-center justify-end gap-1">
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
              <Input
                id="issued_date"
                name="issued_date"
                type="date"
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
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => markInvoiceNotNeeded(orderId))}
      >
        <XCircle className="size-4" />
        Không cần
      </Button>
    </div>
  );
}
