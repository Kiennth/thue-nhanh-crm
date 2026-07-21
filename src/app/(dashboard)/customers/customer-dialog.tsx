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
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { CustomerType } from "@/types/database";

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: "Cá nhân",
  company: "Công ty",
};

interface CustomerDialogProps {
  trigger: React.ReactElement;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    customer_type: CustomerType;
    tax_code: string | null;
    address: string | null;
  };
}

export function CustomerDialog({ trigger, customer }: CustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = customer
        ? await updateCustomer(customer.id, undefined, formData)
        : await createCustomer(undefined, formData);

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
            <DialogTitle>{customer ? "Sửa khách hàng" : "Thêm khách hàng"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Tên khách hàng</Label>
            <Input id="name" name="name" defaultValue={customer?.name} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_type">Loại khách hàng</Label>
            <Select name="customer_type" defaultValue={customer?.customer_type ?? "individual"}>
              <SelectTrigger id="customer_type" className="w-full">
                <SelectValue>
                  {(value: CustomerType) => CUSTOMER_TYPE_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Cá nhân</SelectItem>
                <SelectItem value="company">Công ty</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_code">Mã số thuế (MST)</Label>
            <Input
              id="tax_code"
              name="tax_code"
              placeholder="VD: 0312345678"
              defaultValue={customer?.tax_code ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              name="address"
              placeholder="Địa chỉ xuất hoá đơn"
              defaultValue={customer?.address ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
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
