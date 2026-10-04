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
import { createOrder, updateOrder } from "@/lib/actions/orders";
import { CustomerCombobox } from "./customer-combobox";
import { DateInput } from "@/components/date-input";
import { cn } from "@/lib/utils";

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

function BranchPills({
  branches,
  value,
  onChange,
}: {
  branches: BranchOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {branches.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onChange(b.id)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            value === b.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary",
          )}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
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
  const [pickupId, setPickupId] = useState(order?.pickup_branch_id ?? "");
  const [returnId, setReturnId] = useState(order?.return_branch_id ?? "");
  const [separateReturn, setSeparateReturn] = useState(
    !!order && order.return_branch_id !== order.pickup_branch_id,
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    if (!pickupId) {
      setError("Chọn chi nhánh giao.");
      return;
    }
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
        if (next) {
          setError(null);
          // Mở lại thì lấy đúng chi nhánh đang lưu (đơn có thể vừa đổi).
          setPickupId(order?.pickup_branch_id ?? "");
          setReturnId(order?.return_branch_id ?? "");
          setSeparateReturn(!!order && order.return_branch_id !== order.pickup_branch_id);
        }
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

          {/* Chi nhánh bấm 1 chạm (CEO 2026-10-04): kho nào giao thì mặc định
              kho đó thu hồi; chỉ khi trả về kho khác mới mở chọn riêng. */}
          <div className="space-y-2">
            <Label>Chi nhánh</Label>
            <BranchPills branches={branches} value={pickupId} onChange={setPickupId} />
            <input type="hidden" name="pickup_branch_id" value={pickupId} />
            <input type="hidden" name="return_branch_id" value={separateReturn ? returnId : pickupId} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={separateReturn}
                onChange={(e) => {
                  setSeparateReturn(e.target.checked);
                  if (e.target.checked && !returnId) setReturnId(pickupId);
                }}
              />
              Thu hồi về chi nhánh khác
            </label>
            {separateReturn && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Chi nhánh thu hồi</p>
                <BranchPills branches={branches} value={returnId} onChange={setReturnId} />
              </div>
            )}
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
            <DateInput
              id="order_date"
              name="order_date"
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
