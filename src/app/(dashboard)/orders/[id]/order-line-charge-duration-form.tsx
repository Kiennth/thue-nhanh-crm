"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateOrderLineChargeDuration } from "@/lib/actions/orders";

// Ô "số kỳ tính tiền" của dòng (học Booqable "charge length") — mặc định theo
// thời gian thuê của đơn, sửa tay được (khách cầm 5 ngày, tính 3 ngày). Nút
// ↺ đưa về lại số tự tính.
export function OrderLineChargeDurationForm({
  lineIds,
  duration,
  autoDuration,
  isCustom,
  unitLabel,
  canEdit,
}: {
  lineIds: string[];
  duration: number;
  autoDuration: number | null;
  isCustom: boolean;
  unitLabel: string;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(value: string) {
    setError(null);
    const formData = new FormData();
    formData.set("charge_duration", value);
    startTransition(async () => {
      const result = await updateOrderLineChargeDuration(lineIds, undefined, formData);
      if (result && "error" in result) setError(result.error);
    });
  }

  if (!canEdit) {
    return (
      <span className={cn("tabular-nums", isCustom && "font-medium text-amber-600 dark:text-amber-500")}>
        {duration} {unitLabel}
      </span>
    );
  }

  return (
    <div>
      <form
        action={(formData) => save(String(formData.get("charge_duration") ?? ""))}
        className="flex items-center gap-1"
      >
        <Input
          key={`${duration}-${isCustom}`}
          name="charge_duration"
          type="number"
          min={0.5}
          step={0.5}
          defaultValue={duration}
          className={cn("h-8 w-16", isCustom && "border-amber-500 text-amber-700 dark:text-amber-400")}
          aria-label={`Số ${unitLabel} tính tiền`}
        />
        <Button type="submit" variant="ghost" size="sm" disabled={pending} className="px-1.5">
          {pending ? "..." : "Lưu"}
        </Button>
      </form>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        {unitLabel}
        {isCustom && autoDuration != null && (
          <>
            <span className="text-amber-600 dark:text-amber-500">· thuê {autoDuration}</span>
            <button
              type="button"
              onClick={() => save("")}
              disabled={pending}
              className="hover:text-foreground"
              title={`Về lại ${autoDuration} ${unitLabel} theo thời gian thuê`}
              aria-label="Về lại số tự tính"
            >
              <RotateCcw className="size-3" />
            </button>
          </>
        )}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
