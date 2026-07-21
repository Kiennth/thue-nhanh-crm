"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { overrideOrderTotal } from "@/lib/actions/orders";

export function OrderTotalForm({ orderId, totalValue }: { orderId: string; totalValue: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await overrideOrderTotal(orderId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Sửa tay doanh số</label>
        <Input
          key={totalValue}
          name="total_value"
          type="number"
          min={0}
          step={1000}
          defaultValue={totalValue}
          className="w-40"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
