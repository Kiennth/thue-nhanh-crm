"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reopenOrder } from "@/lib/actions/orders";

export function ReopenOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await reopenOrder(orderId);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Đã mở lại đơn.");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <RotateCcw className="size-4" />
            Mở lại đơn
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mở lại đơn hàng</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Đơn sẽ quay về khâu hiện tại theo tiến độ đã ghi nhận, có thể chỉnh sửa tiếp. Bạn có chắc
          muốn mở lại đơn này?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Không mở lại
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending ? "Đang mở lại..." : "Mở lại đơn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
