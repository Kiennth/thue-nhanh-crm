"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrderEquipmentLinesPrice } from "@/lib/actions/orders";

// Ô sửa đơn giá cho nhóm máy serial đang gộp 1 dòng — lưu 1 lần áp cho cả nhóm.
export function OrderLineGroupPriceForm({
  lineIds,
  unitPrice,
}: {
  lineIds: string[];
  unitPrice: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderEquipmentLinesPrice(lineIds, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
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
