"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDeleteButton({
  confirmMessage,
  successMessage,
  onDelete,
}: {
  confirmMessage: string;
  successMessage: string;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(confirmMessage)) return;

    startTransition(async () => {
      try {
        await onDelete();
        toast.success(successMessage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" disabled={pending} onClick={handleClick}>
      <Trash2 className="size-4" />
      <span className="sr-only">Xoá</span>
    </Button>
  );
}
