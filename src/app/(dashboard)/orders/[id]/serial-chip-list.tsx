"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteOrderEquipmentLine } from "@/lib/actions/orders";

// Dãy serial của 1 dòng sản phẩm đã gộp (kiểu Booqable) — mỗi chip là 1
// máy/1 dòng order_equipment; nút × bỏ riêng máy đó khỏi đơn.
export function SerialChipList({
  items,
  canRemove,
}: {
  // variant: tên biến thể (null = không cần hiện) — chip cùng biến thể gom
  // dưới 1 tiêu đề nhỏ thay vì lặp tên trên từng chip.
  items: { lineId: string; label: string; variant: string | null }[];
  canRemove: boolean;
}) {
  const [removing, setRemoving] = useState<{
    lineId: string;
    label: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!removing) return;
    const target = removing;
    startTransition(async () => {
      try {
        await deleteOrderEquipmentLine(target.lineId);
        toast.success(`Đã bỏ ${target.label} khỏi đơn.`);
        setRemoving(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <>
      <div className="space-y-1">
        {[...new Set(items.map((i) => i.variant))].map((variant) => (
          <div key={variant ?? "_"} className="space-y-0.5">
            {variant && (
              <p className="text-[11px] font-medium text-muted-foreground">
                {variant}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {items
                .filter((i) => i.variant === variant)
                .map((item) => (
                  <span
                    key={item.lineId}
                    className="inline-flex max-w-full items-center gap-0.5 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] break-all"
                    title={item.label}
                  >
                    <span>{item.label}</span>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setRemoving(item)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Bỏ ${item.label} khỏi đơn`}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bỏ máy khỏi đơn</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bỏ <span className="font-mono">{removing?.label}</span> khỏi đơn
            này? Các máy khác trong dòng vẫn giữ nguyên.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoving(null)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Đang bỏ..." : "Bỏ máy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
