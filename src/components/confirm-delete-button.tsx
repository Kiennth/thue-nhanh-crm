"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Dùng dialog trong app thay vì window.confirm() — confirm() có thể bị trình
// duyệt âm thầm chặn (VD: người dùng từng tick "Prevent this page from
// creating additional dialogs"), khiến nút xoá trông như không phản hồi gì.
//
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await action(actionArg);
        toast.success(successMessage);
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
          <Button variant="ghost" size="icon-sm">
            <Trash2 className="size-4" />
            <span className="sr-only">Xoá</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận xoá</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{confirmMessage}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Huỷ
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? "Đang xoá..." : "Xoá"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
