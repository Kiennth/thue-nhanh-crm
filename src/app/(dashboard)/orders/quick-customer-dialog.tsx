"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { createCustomer } from "@/lib/actions/customers";
import type { CustomerType } from "@/types/database";

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: "Cá nhân",
  company: "Công ty",
};

export function QuickCustomerDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreated: (customer: { value: string; label: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCustomer(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (result && "success" in result && result.id) {
        onCreated({ value: result.id, label: String(formData.get("name")) });
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setError(null);
      }}
    >
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Tạo khách hàng mới</DialogTitle>
          </DialogHeader>

          <input type="hidden" name="deposit_percentage" value="100" />

          <div className="space-y-2">
            <Label htmlFor="quick-name">Tên khách hàng</Label>
            <Input id="quick-name" name="name" defaultValue={defaultName} required autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-customer_type">Loại khách hàng</Label>
            <Select name="customer_type" defaultValue="individual">
              <SelectTrigger id="quick-customer_type" className="w-full">
                <SelectValue>{(value: CustomerType) => CUSTOMER_TYPE_LABELS[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Cá nhân</SelectItem>
                <SelectItem value="company">Công ty</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-phone">Số điện thoại</Label>
            <Input id="quick-phone" name="phone" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-email">Email</Label>
            <Input id="quick-email" name="email" type="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-tax_code">Mã số thuế (MST)</Label>
            <Input id="quick-tax_code" name="tax_code" placeholder="VD: 0312345678" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-address">Địa chỉ</Label>
            <Input id="quick-address" name="address" placeholder="Địa chỉ xuất hoá đơn" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang tạo..." : "Tạo & chọn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
