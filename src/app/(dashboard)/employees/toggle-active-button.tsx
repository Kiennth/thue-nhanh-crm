"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setEmployeeActive } from "@/lib/actions/employees";

export function ToggleActiveButton({
  id,
  name,
  isActive,
}: {
  id: string;
  name: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const confirmMessage = isActive
      ? `Vô hiệu hoá tài khoản của "${name}"?`
      : `Kích hoạt lại tài khoản của "${name}"?`;
    if (!confirm(confirmMessage)) return;

    startTransition(async () => {
      try {
        await setEmployeeActive(id, !isActive);
        toast.success(isActive ? "Đã vô hiệu hoá." : "Đã kích hoạt lại.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={handleClick}>
      {isActive ? "Vô hiệu hoá" : "Kích hoạt"}
    </Button>
  );
}
