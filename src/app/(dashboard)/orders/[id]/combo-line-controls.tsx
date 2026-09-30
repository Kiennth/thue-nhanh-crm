"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductSearchPicker } from "@/components/product-search-picker";
import { getComboSwapOptions, swapComboChild, type ComboSwapOption } from "@/lib/actions/orders";

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
