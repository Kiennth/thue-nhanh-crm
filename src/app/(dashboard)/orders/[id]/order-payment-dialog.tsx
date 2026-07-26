"use client";

import { useState, useTransition } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createOrderPayment } from "@/lib/actions/order-payments";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from "@/lib/order-labels";
import type { OrderPaymentType } from "@/types/database";

const DIALOG_TITLES: Record<OrderPaymentType, string> = {
  invoice: "Thêm thanh toán",
  deposit_collect: "Thu tiền cọc",
  deposit_refund: "Hoàn tiền cọc",
};

const SUBMIT_LABELS: Record<OrderPaymentType, string> = {
  invoice: "Ghi nhận thanh toán",
  deposit_collect: "Ghi nhận thu cọc",
  deposit_refund: "Ghi nhận hoàn cọc",
};

export function OrderPaymentDialog({
  orderId,
  trigger,
  paymentType = "invoice",
}: {
  orderId: string;
  trigger: React.ReactElement;
  paymentType?: OrderPaymentType;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createOrderPayment(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="payment_type" value={paymentType} />
          <DialogHeader>
            <DialogTitle>{DIALOG_TITLES[paymentType]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền</Label>
            <Input id="amount" name="amount" type="number" min={0} step={1000} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Hình thức</Label>
            <Select name="method" defaultValue="tien_mat">
              <SelectTrigger id="method" className="w-full">
                <SelectValue>{(value: string) => PAYMENT_METHOD_LABELS[value as keyof typeof PAYMENT_METHOD_LABELS]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_at">Ngày thanh toán</Label>
            <Input
              id="paid_at"
              name="paid_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" name="note" placeholder="Không bắt buộc" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : SUBMIT_LABELS[paymentType]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
