"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
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
  branches: BranchOption[];
  order?: {
    id: string;
    order_code: string;
    pickup_branch_id: string;
    return_branch_id: string;
    customer_id: string;
    customer_name: string;
    orderer_name: string | null;
    orderer_phone: string | null;
    orderer_email: string | null;
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

export function OrderDialog({ branches, order }: OrderDialogProps) {
  const isEdit = !!order;
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = isEdit ? (
    <Button variant="outline">Sửa</Button>
  ) : (
    <Button>
      <Plus className="size-4" />
      Thêm đơn hàng
    </Button>
  );
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
            <Label htmlFor="pickup_branch_id">Chi nhánh giao</Label>
            <Select name="pickup_branch_id" defaultValue={order?.pickup_branch_id}>
              <SelectTrigger id="pickup_branch_id" className="w-full">
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
            <Label htmlFor="return_branch_id">Chi nhánh thu hồi</Label>
            <Select name="return_branch_id" defaultValue={order?.return_branch_id}>
              <SelectTrigger id="return_branch_id" className="w-full">
                <SelectValue placeholder="Giống chi nhánh giao">
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
            <Label htmlFor="orderer_name">Người đặt hàng</Label>
            <Input
              id="orderer_name"
              name="orderer_name"
              placeholder="Không bắt buộc — tên người trực tiếp đặt đơn"
              defaultValue={order?.orderer_name ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderer_phone">Số điện thoại</Label>
              <Input
                id="orderer_phone"
                name="orderer_phone"
                placeholder="Không bắt buộc"
                defaultValue={order?.orderer_phone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderer_email">Email</Label>
              <Input
                id="orderer_email"
                name="orderer_email"
                type="email"
                placeholder="Không bắt buộc"
                defaultValue={order?.orderer_email ?? ""}
              />
            </div>
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
