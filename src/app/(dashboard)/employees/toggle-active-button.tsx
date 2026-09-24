"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setEmployeeActive } from "@/lib/actions/employees";

// Dialog trong app thay window.confirm() — confirm() bị trình duyệt âm thầm
// chặn khiến nút như không phản hồi (CEO gặp khi vô hiệu hoá Gia Kiệt
// 2026-09-24), xem thêm confirm-delete-button.tsx.
export function ToggleActiveButton({
  id,
  name,
  isActive,
}: {
  id: string;
  name: string;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await setEmployeeActive(id, !isActive);
        toast.success(isActive ? "Đã vô hiệu hoá." : "Đã kích hoạt lại.");
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
          <Button variant="ghost" size="sm">
            {isActive ? "Vô hiệu hoá" : "Kích hoạt"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isActive ? "Vô hiệu hoá tài khoản" : "Kích hoạt lại tài khoản"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isActive
            ? `"${name}" sẽ không đăng nhập được CRM nữa. Lịch sử đơn và lương vẫn giữ nguyên.`
            : `"${name}" sẽ đăng nhập lại được CRM.`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Huỷ
          </Button>
          <Button
            variant={isActive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "Đang lưu..." : isActive ? "Vô hiệu hoá" : "Kích hoạt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
