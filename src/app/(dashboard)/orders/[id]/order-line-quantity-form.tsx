"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { updateOrderEquipmentLineQuantity } from "@/lib/actions/orders";
import { useUnsavedSection } from "@/components/unsaved-changes";
import { cn } from "@/lib/utils";

// Số lượng dòng — sửa xong lưu bằng thanh "Lưu thay đổi" chung (B1).
export function OrderLineQuantityForm({
  lineId,
  quantity,
  itemLabel,
}: {
  lineId: string;
  quantity: number;
  itemLabel?: string | null;
}) {
  const [value, setValue] = useState(String(quantity));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Trang tải lại số mới sau khi lưu → ô theo số mới.
  const [prevQuantity, setPrevQuantity] = useState(quantity);
  if (prevQuantity !== quantity) {
    setPrevQuantity(quantity);
    setValue(String(quantity));
  }
  const dirty = value.trim() !== "" && Number(value) !== quantity;
  useUnsavedSection(`qty:${lineId}`, `Số lượng${itemLabel ? ` · ${itemLabel}` : ""}`, dirty, save);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("quantity", value.trim());
    startTransition(async () => {
      const result = await updateOrderEquipmentLineQuantity(lineId, undefined, fd);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        name="quantity"
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className={cn("h-8 w-14", dirty && "border-amber-400 bg-[#FFFBEB] dark:bg-amber-950/30")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
