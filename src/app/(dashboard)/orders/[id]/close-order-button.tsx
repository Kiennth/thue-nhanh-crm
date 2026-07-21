"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeOrder } from "@/lib/actions/orders";

export default function CloseOrderButton({
  orderId,
  disabled,
}: {
  orderId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Đóng đơn hàng này? Sau khi đóng sẽ không tính thêm khoán.")) return;

    startTransition(async () => {
      try {
        await closeOrder(orderId);
        toast.success("Đã đóng đơn.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={disabled || pending} title={disabled ? "Phải hoàn thành đủ 10 khâu trước" : undefined}>
      <CheckCircle2 className="size-4" />
      {pending ? "Đang đóng..." : "Hoàn tất đơn"}
    </Button>
  );
}
