"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteBranch } from "@/lib/actions/branches";

export function DeleteBranchButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Xoá chi nhánh "${name}"? Hành động này không thể hoàn tác.`)) return;

    startTransition(async () => {
      try {
        await deleteBranch(id);
        toast.success("Đã xoá chi nhánh.");
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
