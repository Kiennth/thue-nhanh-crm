"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrderEquipmentLinePrice } from "@/lib/actions/orders";

export function OrderLinePriceForm({ lineId, unitPrice }: { lineId: string; unitPrice: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderEquipmentLinePrice(lineId, undefined, formData);
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
        className="h-8 w-28"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
