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
import { createOrder, updateOrder } from "@/lib/actions/orders";
import { CustomerCombobox } from "./customer-combobox";

interface BranchOption {
  id: string;
  name: string;
}

interface OrderDialogProps {
  trigger: React.ReactElement;
  branches: BranchOption[];
  order?: {
    id: string;
    order_code: string;
    branch_id: string;
    customer_id: string;
    customer_name: string;
    order_date: string;
  };
}

function generateOrderCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `DH${y}${m}${d}-${rand}`;
}

export function OrderDialog({ trigger, branches, order }: OrderDialogProps) {
  const isEdit = !!order;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [orderCode] = useState(() => order?.order_code ?? generateOrderCode());

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = order
        ? await updateOrder(order.id, undefined, formData)
        : await createOrder(undefined, formData);

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
          <DialogHeader>
            <DialogTitle>{isEdit ? "Sửa đơn hàng" : "Thêm đơn hàng"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="order_code">Mã đơn</Label>
            <Input id="order_code" name="order_code" defaultValue={orderCode} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            <Select name="branch_id" defaultValue={order?.branch_id}>
              <SelectTrigger id="branch_id" className="w-full">
                <SelectValue placeholder="Chọn chi nhánh">
                  {(value: string) => branches.find((b) => b.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_id">Khách hàng</Label>
            <CustomerCombobox
              name="customer_id"
              defaultCustomer={order ? { id: order.customer_id, name: order.customer_name } : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="order_date">Ngày</Label>
            <Input
              id="order_date"
              name="order_date"
              type="date"
              defaultValue={order?.order_date ?? new Date().toISOString().slice(0, 10)}
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
  );
}
