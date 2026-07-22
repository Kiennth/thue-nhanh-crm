"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicateOrder } from "@/lib/actions/orders";

export function DuplicateOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await duplicateOrder(orderId);
      if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      <Copy className="size-4" />
      {pending ? "Đang tạo..." : "Nhân bản"}
    </Button>
  );
}
