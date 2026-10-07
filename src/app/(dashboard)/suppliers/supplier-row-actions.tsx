"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteSupplier } from "@/lib/actions/suppliers";

// Copy "STK · Ngân hàng · Chủ TK" để dán vào app ngân hàng / Zalo kế toán.
export function CopyBankButton({ text }: { text: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Đã copy thông tin chuyển khoản."))}
    >
      <Copy className="size-4" />
      <span className="sr-only">Copy thông tin chuyển khoản</span>
    </Button>
  );
}

export function DeleteSupplierButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Xoá nhà cung cấp "${name}"? Muốn giữ lịch sử thì bỏ tick "Đang hợp tác" thay vì xoá.`}
      successMessage="Đã xoá nhà cung cấp."
      action={deleteSupplier}
      actionArg={id}
    />
  );
}
