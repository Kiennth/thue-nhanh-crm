"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerForm } from "../customers/customer-form";

// "+ Thêm khách" ngay trong ô chọn khách (Tạo đơn, sửa đơn) — dùng đúng form
// Công ty / Cá nhân của trang Khách hàng (B6, Grok CRM 09/10). Tạo xong tự
// chọn khách đó cho đơn.
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm khách</DialogTitle>
        </DialogHeader>
        {open && (
          <CustomerForm
            canViewIdNumber
            defaultName={defaultName}
            onDone={(saved) => {
              if (saved.id) onCreated({ value: saved.id, label: saved.name });
              onOpenChange(false);
            }}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
