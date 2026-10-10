"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, Plus, Replace, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  autoAssignSerials,
  changeOrderLinesProduct,
  getQuickOrderCatalog,
  setSerialGroupQuantity,
  type QuickOrderCatalogItem,
} from "@/lib/actions/orders";

// Sửa nhanh dòng hàng kiểu Booqable (CEO 2026-10-05): −/+ số lượng, tự gán
// serial, đổi sản phẩm — không phải xoá dòng rồi thêm lại (mất giá sửa tay).

export function SerialQuantityStepper({ lineIds, quantity }: { lineIds: string[]; quantity: number }) {
  const [value, setValue] = useState(String(quantity));
  // Chỉ gửi số trong ô khi người dùng thật sự GÕ — bấm vào rồi bấm ra ngoài
  // không được gửi lại số cũ (từng làm số máy bị đổi ngược, CEO 09/10).
  const [typed, setTyped] = useState(false);
  const [pending, startTransition] = useTransition();

  function commit(next: number) {
    if (!Number.isInteger(next) || next < 1 || next === quantity) {
      setValue(String(quantity));
      return;
    }
    setValue(String(next));
    startTransition(async () => {
      const result = await setSerialGroupQuantity(lineIds, next);
      if (result && "error" in result) {
        toast.error(result.error);
        setValue(String(quantity));
      }
    });
  }

  return (
    <div className="inline-flex items-center rounded-md border" key={quantity}>
      <button
        type="button"
        disabled={pending || quantity <= 1}
        onClick={() => commit(quantity - 1)}
        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Bớt 1"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        value={value}
        inputMode="numeric"
        disabled={pending}
        onChange={(e) => {
          setTyped(true);
          setValue(e.target.value.replace(/\D/g, ""));
        }}
        onBlur={() => {
          if (!typed) return;
          setTyped(false);
          commit(Number(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-7 w-9 bg-transparent text-center text-sm tabular-nums outline-none"
        aria-label="Số lượng"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => commit(quantity + 1)}
        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Thêm 1"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function AutoAssignButton({ lineIds }: { lineIds: string[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await autoAssignSerials(lineIds);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          if (result.placeholders > 0) {
            toast.warning(
              `Đã gán ${result.assigned} máy, trong đó ${result.placeholders} máy tạm AUTO (mã này chưa nhập serial thật) — vào trang mã hàng đổi mã máy thành serial thật khi có.`,
            );
          }
          if (result.missing > 0) {
            toast.warning(
              `Đã gán ${result.assigned} máy — còn thiếu ${result.missing} máy trống ở kho giao (điều chuyển hoặc mua thêm).`,
            );
          } else {
            toast.success(`Đã gán ${result.assigned} máy.`);
          }
        })
      }
      className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
    >
      <Wand2 className="size-3" />
      {pending ? "Đang gán…" : "Tự gán serial"}
    </button>
  );
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const vnd = new Intl.NumberFormat("vi-VN");

export function ChangeProductButton({
  lineIds,
  currentLabel,
  quantity,
}: {
  lineIds: string[];
  currentLabel: string;
  quantity: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuickOrderCatalogItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<QuickOrderCatalogItem | null>(null);
  const [keepPrice, setKeepPrice] = useState(true);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setPicked(null);
    setQuery("");
    setKeepPrice(true);
    if (!items) {
      startTransition(async () => {
        const catalog = await getQuickOrderCatalog();
        setItems(
          catalog.items.filter((i) => i.productType !== "service" && i.trackingType !== "combo"),
        );
      });
    }
  }

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!items || !q) return [];
    return items.filter((i) => fold(i.label).includes(q)).slice(0, 30);
  }, [items, query]);

  function submit() {
    if (!picked) return;
    startTransition(async () => {
      const result = await changeOrderLinesProduct(
        lineIds,
        { typeId: picked.typeId, unitId: picked.unitId },
        keepPrice,
      );
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã đổi sang ${picked.label}.`);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Đổi sang sản phẩm khác, giữ số lượng"
      >
        <Replace className="size-3" />
        Đổi SP
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi sản phẩm</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{currentLabel}</span> × {quantity} → sản phẩm mới, giữ số
            lượng và vị trí dòng.
          </p>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder={items ? "Gõ tên sản phẩm…" : "Đang tải danh mục…"}
            className="h-10 w-full rounded-md border bg-transparent px-2.5 text-sm"
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setPicked(i)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted ${
                  picked?.key === i.key ? "border-primary bg-primary/5" : ""
                }`}
              >
                <span className="min-w-0">{i.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{vnd.format(i.price)}đ</span>
              </button>
            ))}
            {items && query.trim() && filtered.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">Không có sản phẩm nào khớp.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepPrice} onChange={(e) => setKeepPrice(e.target.checked)} />
            Giữ đơn giá hiện tại (bỏ chọn = tính theo bảng giá sản phẩm mới)
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Đóng
            </Button>
            <Button onClick={submit} disabled={!picked || pending}>
              {pending && picked ? "Đang đổi…" : picked ? `Đổi sang ${picked.label}` : "Chọn sản phẩm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
