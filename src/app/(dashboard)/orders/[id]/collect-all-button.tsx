"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BadgeDollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { collectAllDue } from "@/lib/actions/order-payments";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from "@/lib/order-labels";

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// "Thu đủ tiền" (CEO 2026-10-06): 1 bấm ghi tiền thuê còn thiếu (gồm VAT) + cọc
// còn thiếu. Hộp nhỏ chọn phương thức rồi xác nhận.
export function CollectAllButton({
  orderId,
  invoiceDue,
  depositDue,
}: {
  orderId: string;
  invoiceDue: number;
  depositDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof PAYMENT_METHOD_OPTIONS)[number]>("chuyen_khoan");
  const [pending, startTransition] = useTransition();
  const total = Math.max(invoiceDue, 0) + Math.max(depositDue, 0);
  if (total <= 0) return null;

  function run() {
    startTransition(async () => {
      const result = await collectAllDue(orderId, method, invoiceDue, depositDue);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã thu ${fmt.format(total)}đ.`);
      setOpen(false);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={pending}>
        <BadgeDollarSign className="size-4" />
        Thu đủ tiền
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Thu đủ tiền · {fmt.format(total)}đ</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {invoiceDue > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tiền thuê còn thiếu (gồm VAT)</span>
                <span className="font-semibold tabular-nums">{fmt.format(invoiceDue)}đ</span>
              </div>
            )}
            {depositDue > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tiền cọc còn thiếu</span>
                <span className="font-semibold tabular-nums">{fmt.format(depositDue)}đ</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={method === m ? "default" : "outline"}
                  onClick={() => setMethod(m)}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Ghi 2 dòng thanh toán riêng (thuê / cọc), ngày hôm nay.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Đóng
            </Button>
            <Button onClick={run} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <BadgeDollarSign className="size-4" />}
              Ghi nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
