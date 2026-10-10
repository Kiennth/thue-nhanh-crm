"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  inMenu = false,
  requireText,
}: {
  confirmMessage: string;
  successMessage: string;
  action: (arg: T) => Promise<void>;
  actionArg: T;
  // Danh sách dài (đề xuất CRM v2 §4.3): không để thùng rác trên từng dòng —
  // nút "⋯" mở menu, mục "Xoá…" chữ đỏ rồi mới tới hộp xác nhận.
  inMenu?: boolean;
  // Xoá thứ quan trọng (đơn hàng — Grok tách gọn CRM 10/10): phải gõ đúng
  // chuỗi này (vd mã đơn) thì nút Xoá mới bấm được.
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const typedOk = !requireText || typed.trim().toUpperCase() === requireText.trim().toUpperCase();
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      {inMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Thao tác</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
              <Trash2 />
              Xoá…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DialogTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <Trash2 className="size-4" />
              <span className="sr-only">Xoá</span>
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận xoá</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{confirmMessage}</p>
        {requireText && (
          <label className="space-y-1.5 text-sm">
            <span>
              Gõ <b className="font-mono">{requireText}</b> để xác nhận
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="h-9 w-full rounded-md border bg-background px-3 font-mono"
              aria-label="Gõ lại để xác nhận xoá"
            />
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Đóng
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending || !typedOk}>
            {pending ? "Đang xoá..." : "Xoá"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
