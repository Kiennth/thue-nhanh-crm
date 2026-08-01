"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderLineNote } from "@/lib/actions/orders";

export function OrderLineNoteForm({ lineId, note }: { lineId: string; note: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderLineNote(lineId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex w-40 flex-col items-start gap-1">
      <Textarea
        key={note ?? ""}
        name="note"
        defaultValue={note ?? ""}
        placeholder="Địa chỉ + SĐT nhận/trả hàng"
        className="min-h-14 text-xs"
        maxLength={500}
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu ghi chú"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
