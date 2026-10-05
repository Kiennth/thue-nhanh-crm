"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, X } from "lucide-react";
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
  type SwapInstanceOption,
  type SwapMode,
} from "@/lib/actions/orders";

const SWAP_MODE_HINT: Record<SwapMode, string> = {
  plan: "Chỉ thay máy — dòng hàng, số lượng, đơn giá giữ nguyên.",
  live: "Máy đang ở chỗ khách: máy cũ tự về kho (Sẵn có), máy mới chuyển sang Đang cho thuê. Đơn giá giữ nguyên.",
  history: "Đơn đã nhập kho/hoàn tất: chỉ sửa lại serial cho đúng thực tế, không đụng tồn kho.",
};

const serialOf = (label: string) => label.split(" · ")[0].trim().toLowerCase();

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
  // Bấm vào serial để đổi sang máy khác kiểu Booqable — kể cả khi máy đang ở
  // chỗ khách (xem loadSwapContext trong actions/orders.ts).
  canSwap?: boolean;
}) {
  const [swapping, setSwapping] = useState<{ lineId: string; label: string } | null>(null);
  const [swapData, setSwapData] = useState<
    { mode: SwapMode; options: SwapInstanceOption[] } | { error: string } | null
  >(null);
  const [swapFilter, setSwapFilter] = useState("");

  function openSwap(item: { lineId: string; label: string }) {
    setSwapping(item);
    setSwapData(null);
    setSwapFilter("");
    startTransition(async () => {
      setSwapData(await getSwapInstanceOptions(item.lineId));
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

  const swapOptions = swapData && "options" in swapData ? swapData.options : null;
  const swapQuery = swapFilter.trim().toLowerCase();
  const filteredOptions = (swapOptions ?? []).filter((o) => o.label.toLowerCase().includes(swapQuery));
  const freeCount = (swapOptions ?? []).filter((o) => o.free).length;

  // Máy quét mã vạch gõ serial + Enter: khớp đúng serial (hoặc chỉ còn 1 máy
  // trống khớp) thì đổi luôn.
  function handleSwapEnter() {
    if (!swapQuery || pending) return;
    const exact = filteredOptions.find((o) => serialOf(o.label) === swapQuery);
    const freeMatches = filteredOptions.filter((o) => o.free);
    const pick = exact ?? (freeMatches.length === 1 ? freeMatches[0] : null);
    if (!pick) {
      toast.error(filteredOptions.length ? "Có nhiều máy khớp — bấm chọn 1 máy." : "Không có máy nào khớp serial này.");
      return;
    }
    if (!pick.free) {
      toast.error(`${pick.label}: ${pick.reason}.`);
      return;
    }
    handleSwap(pick.id, pick.label);
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
                        className="group inline-flex items-center gap-1 rounded hover:text-primary"
                        title="Đổi serial (giữ nguyên giá, số lượng)"
                      >
                        <span className="group-hover:underline">{item.label}</span>
                        <ArrowLeftRight className="size-3 text-muted-foreground group-hover:text-primary" />
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
            <DialogTitle>
              Đổi serial <span className="font-mono">{swapping?.label}</span>
            </DialogTitle>
          </DialogHeader>
          {swapData === null ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách máy…</p>
          ) : "error" in swapData ? (
            <p className="text-sm text-destructive">{swapData.error}</p>
          ) : (
            <div className="space-y-2">
              <p
                className={
                  swapData.mode === "plan"
                    ? "text-xs text-muted-foreground"
                    : "rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                }
              >
                {SWAP_MODE_HINT[swapData.mode]}
              </p>
              <input
                autoFocus
                value={swapFilter}
                onChange={(e) => setSwapFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSwapEnter();
                  }
                }}
                placeholder="Quét hoặc gõ serial rồi Enter…"
                className="h-10 w-full rounded-md border bg-transparent px-2.5 font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {freeCount} máy chọn được · {(swapOptions?.length ?? 0) - freeCount} máy bận
              </p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {filteredOptions.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">Không có máy nào khớp.</p>
                )}
                {filteredOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={pending || !o.free}
                    onClick={() => handleSwap(o.id, o.label)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 font-mono break-all">{o.label}</span>
                    {o.reason && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{o.reason}</span>
                    )}
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
