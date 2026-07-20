"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCustomer } from "@/lib/actions/customers";

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Xoá khách hàng "${name}"? Hành động này không thể hoàn tác.`)) return;

    startTransition(async () => {
      try {
        await deleteCustomer(id);
        toast.success("Đã xoá khách hàng.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={pending} onClick={handleDelete}>
      <Trash2 className="size-4" />
      <span className="sr-only">Xoá</span>
    </Button>
  );
}
