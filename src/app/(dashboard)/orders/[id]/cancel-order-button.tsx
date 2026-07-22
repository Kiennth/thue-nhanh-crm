"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelOrder } from "@/lib/actions/orders";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await cancelOrder(orderId);
        toast.success("Đã huỷ đơn.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Ban className="size-4" />
            Huỷ đơn
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Huỷ đơn hàng</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Đơn sẽ chuyển sang trạng thái &quot;Đã huỷ&quot;, không tính khoán và không xoá dữ liệu.
          Bạn có chắc muốn huỷ đơn này?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Không huỷ
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? "Đang huỷ..." : "Huỷ đơn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
