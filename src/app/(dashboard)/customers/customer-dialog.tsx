"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/create-button";
import { CustomerForm, type CustomerFormValues } from "./customer-form";

// Thêm / sửa khách (B6 — form Công ty / Cá nhân ở customer-form.tsx).
export function CustomerDialog({
  customer,
  canViewIdNumber = false,
  editTriggerVariant = "icon",
}: {
  customer?: CustomerFormValues;
  canViewIdNumber?: boolean;
  // Biến thể nút "Sửa" — icon-only ở bảng danh sách (mặc định), outline có
  // chữ ở trang chi tiết.
  editTriggerVariant?: "icon" | "outline";
}) {
  const isEdit = !!customer;
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = !isEdit ? (
    <CreateButton label="Thêm khách" />
  ) : editTriggerVariant === "outline" ? (
    <Button variant="outline">
      <Pencil className="size-4" />
      Sửa
    </Button>
  ) : (
    <Button variant="ghost" size="icon-sm">
      <Pencil className="size-4" />
      <span className="sr-only">Sửa</span>
    </Button>
  );
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{customer ? "Sửa khách hàng" : "Thêm khách"}</DialogTitle>
        </DialogHeader>
        {open && (
          <CustomerForm
            customer={customer}
            canViewIdNumber={canViewIdNumber}
            onDone={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
