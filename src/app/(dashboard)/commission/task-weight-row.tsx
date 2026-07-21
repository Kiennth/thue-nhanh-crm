"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateTaskWeight } from "@/lib/actions/commission";

export function TaskWeightRow({
  id,
  label,
  weightPercentage,
}: {
  id: string;
  label: string;
  weightPercentage: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateTaskWeight(id, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      key={weightPercentage}
      action={handleSubmit}
      className="flex items-center gap-2 border-b py-2 last:border-b-0"
    >
      <span className="flex-1">{label}</span>
      <Input
        name="weight_percentage"
        type="number"
        min={0.01}
        max={100}
        step={0.01}
        defaultValue={weightPercentage}
        className="w-24"
      />
      <span className="text-sm text-muted-foreground">%</span>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
