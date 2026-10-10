"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookmarkPlus, X } from "lucide-react";
import { createSavedView, deleteSavedView } from "@/lib/actions/saved-views";

// "+ Lưu view này": lưu bộ lọc đang xem thành 1 tab riêng của mình.
export function SaveViewButton() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary"
      >
        <BookmarkPlus className="size-3.5" /> Lưu view này
      </button>
    );
  }
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createSavedView("orders", name, searchParams.toString());
          if ("error" in res) return void toast.error(res.error);
          toast.success(`Đã lưu view "${name.trim()}".`);
          setOpen(false);
          setName("");
        });
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoFocus
        placeholder="Tên view (vd: HCM chưa thu)"
        className="h-8 w-48 rounded-full border bg-background px-3 text-sm"
        aria-label="Tên view"
      />
      <button type="submit" disabled={pending || !name.trim()} className="h-8 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
        Lưu
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-sm text-muted-foreground">
        Đóng
      </button>
    </form>
  );
}

export function DeleteSavedViewButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={`Xoá view "${name}"`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          try {
            await deleteSavedView(id);
            toast.success(`Đã xoá view "${name}".`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Không xoá được view.");
          }
        });
      }}
      className="rounded-full p-0.5 hover:bg-black/10"
    >
      <X className="size-3" />
      <span className="sr-only">Xoá view</span>
    </button>
  );
}
