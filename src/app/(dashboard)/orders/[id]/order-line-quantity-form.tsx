"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrderEquipmentLineQuantity } from "@/lib/actions/orders";

export function OrderLineQuantityForm({ lineId, quantity }: { lineId: string; quantity: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderEquipmentLineQuantity(lineId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-1">
      <Input
        key={quantity}
        name="quantity"
        type="number"
        min={1}
        step={1}
        defaultValue={quantity}
        className="h-8 w-14"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
