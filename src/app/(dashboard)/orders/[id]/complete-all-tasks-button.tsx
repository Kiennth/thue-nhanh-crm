"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { completeAllOrderTasks } from "@/lib/actions/orders";

// "Hoàn tất 10 khâu" (CEO 2026-10-06) — hộp xác nhận nói rõ hệ quả rồi mới chạy.
export function CompleteAllTasksButton({ orderId, remaining }: { orderId: string; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await completeAllOrderTasks(orderId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã hoàn tất 10 khâu.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)} disabled={pending}>
        <CheckCheck className="size-4" />
        Hoàn tất 10 khâu
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hoàn tất {remaining} khâu còn lại?</DialogTitle>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Mọi khâu còn dở ghi tên bạn, ghi chú &quot;Hoàn tất nhanh&quot; — admin chia lại khoán sau.</li>
            <li>Máy serial chưa gán sẽ tự gán; thiếu máy thì dừng và báo.</li>
            <li>Giao hàng trừ kho, Nhập kho trả kho như bấm tay.</li>
            <li>Ngày khâu: tới Giao hàng = ngày nhận hàng, sau đó = ngày trả (không quá hôm nay). Doanh số ghi theo ngày giao.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Huỷ
            </Button>
            <Button onClick={run} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
              Hoàn tất
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
