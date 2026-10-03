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
import {
  deleteOrderEquipmentLine,
  getSwapInstanceOptions,
  swapOrderLineInstance,
} from "@/lib/actions/orders";

// Dãy serial của 1 dòng sản phẩm đã gộp (kiểu Booqable) — mỗi chip là 1
// máy/1 dòng order_equipment; nút × bỏ riêng máy đó khỏi đơn.
export function SerialChipList({
  items,
  canRemove,
  canSwap = false,
}: {
  // variant: tên biến thể (null = không cần hiện) — chip cùng biến thể gom
  // dưới 1 tiêu đề nhỏ thay vì lặp tên trên từng chip.
  items: { lineId: string; label: string; variant: string | null }[];
  canRemove: boolean;
  // Đơn chưa giao: bấm vào serial để đổi sang máy rảnh khác (phương án B —
  // hệ thống tự chọn máy khi thêm theo số lượng, nhân viên đổi nếu cần).
  canSwap?: boolean;
}) {
  const [swapping, setSwapping] = useState<{ lineId: string; label: string } | null>(null);
  const [swapOptions, setSwapOptions] = useState<{ id: string; label: string }[] | null>(null);
  const [swapFilter, setSwapFilter] = useState("");

  function openSwap(item: { lineId: string; label: string }) {
    setSwapping(item);
    setSwapOptions(null);
    setSwapFilter("");
    startTransition(async () => {
      setSwapOptions(await getSwapInstanceOptions(item.lineId));
    });
  }

  function handleSwap(instanceId: string, label: string) {
    if (!swapping) return;
    const target = swapping;
    startTransition(async () => {
      const result = await swapOrderLineInstance(target.lineId, instanceId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã đổi ${target.label} → ${label}.`);
      setSwapping(null);
    });
  }
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
                    {canSwap ? (
                      <button
                        type="button"
                        onClick={() => openSwap(item)}
                        className="rounded hover:text-primary hover:underline"
                        title="Bấm để đổi sang máy khác"
                      >
                        {item.label}
                      </button>
                    ) : (
                      <span>{item.label}</span>
                    )}
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
      <Dialog open={!!swapping} onOpenChange={(open) => !open && setSwapping(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi máy {swapping?.label}</DialogTitle>
          </DialogHeader>
          {swapOptions === null ? (
            <p className="text-sm text-muted-foreground">Đang tải máy trống…</p>
          ) : swapOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kho giao không còn máy trống nào cùng loại.</p>
          ) : (
            <div className="space-y-2">
              <input
                value={swapFilter}
                onChange={(e) => setSwapFilter(e.target.value)}
                placeholder="Lọc theo serial…"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              />
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {swapOptions
                  .filter((o) => o.label.toLowerCase().includes(swapFilter.trim().toLowerCase()))
                  .map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={pending}
                      onClick={() => handleSwap(o.id, o.label)}
                      className="block w-full rounded-md border px-2.5 py-1.5 text-left font-mono text-sm hover:bg-muted"
                    >
                      {o.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
