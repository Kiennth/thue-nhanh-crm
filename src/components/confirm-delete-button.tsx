"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// `action` phải là reference Server Action gốc (import trực tiếp), KHÔNG
// bọc trong arrow function ở component cha (Server Component) — closure tự
// tạo không serialize được qua ranh giới RSC, chỉ Server Action reference
// thật mới được.
export function ConfirmDeleteButton<T>({
  confirmMessage,
  successMessage,
  action,
  actionArg,
}: {
  confirmMessage: string;
  successMessage: string;
  action: (arg: T) => Promise<void>;
  actionArg: T;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(confirmMessage)) return;

    startTransition(async () => {
      try {
        await action(actionArg);
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
