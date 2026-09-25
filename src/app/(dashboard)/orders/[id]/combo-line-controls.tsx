"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductSearchPicker } from "@/components/product-search-picker";
import {
  getComboSwapOptions,
  swapComboChild,
  updateComboLinePrice,
  type ComboSwapOption,
} from "@/lib/actions/orders";

// Ô sửa giá 1 bộ combo — lưu xong tiền chia lại xuống các món con.
export function ComboPriceForm({
  parentLineId,
  unitPrice,
}: {
  parentLineId: string;
  unitPrice: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateComboLinePrice(parentLineId, undefined, formData);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-1">
      <Input
        key={unitPrice}
        name="unit_price"
        type="number"
        min={0}
        step={1000}
        defaultValue={unitPrice}
        className="h-8 w-24"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

// Nút "Đổi món" cạnh từng món trong combo — danh sách hàng chỉ tải khi mở
// hộp thoại (vài nghìn máy, không nhồi sẵn vào trang).
export function ComboChildSwapButton({
  childLineId,
  currentLabel,
}: {
  childLineId: string;
  currentLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComboSwapOption[] | null>(null);
  const [loading, startLoading] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !options) {
      startLoading(async () => {
        setOptions(await getComboSwapOptions(childLineId));
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center"
        title="Đổi món này"
        aria-label={`Đổi ${currentLabel}`}
      >
        <ArrowLeftRight className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Đổi món trong combo</DialogTitle>
            <DialogDescription>
              Đang là: <span className="font-medium text-foreground">{currentLabel}</span>. Phần
              tiền của món này chuyển sang món mới; ghi chú dòng lưu lại người đổi.
            </DialogDescription>
          </DialogHeader>
          <ProductSearchPicker
            options={options ?? []}
            loading={loading}
            autoFocus
            placeholder="Gõ tên sản phẩm / serial để đổi sang..."
            onPick={async (option) => {
              const result = await swapComboChild(childLineId, option);
              if (!result || !("error" in result)) setOpen(false);
              return result;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
