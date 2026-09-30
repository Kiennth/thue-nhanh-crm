"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderLineExtraInfo } from "@/lib/actions/orders";

// Ghi chú hiển thị của dòng, nằm ngay dưới tên sản phẩm — học Booqable
// "extra information" (CEO 2026-09-30): phụ kiện đi kèm, địa chỉ + SĐT giao/
// thu hồi... Có ghi chú thì hiện luôn (không phải bấm mở như Booqable), bấm
// vào để sửa; chưa có thì chỉ là 1 nút "+ ghi chú" nhỏ.
export function LineNoteEditor({
  lineIds,
  note,
  canEdit,
  placeholder = "Ghi chú dòng này (phụ kiện đi kèm, lưu ý...)",
}: {
  lineIds: string[];
  note: string | null;
  canEdit: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderLineExtraInfo(lineIds, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  if (!canEdit) {
    return note ? (
      <p className="text-xs font-normal whitespace-pre-wrap text-muted-foreground">{note}</p>
    ) : null;
  }

  if (!editing) {
    return note ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-start gap-1.5 rounded-md border border-dashed border-transparent px-1.5 py-1 text-left text-xs font-normal text-muted-foreground hover:border-border hover:bg-muted/50"
        title="Bấm để sửa ghi chú"
      >
        <span className="min-w-0 flex-1 whitespace-pre-wrap">{note}</span>
        <Pencil className="mt-0.5 size-3 shrink-0 opacity-0 group-hover:opacity-100" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-1.5 text-xs font-normal text-muted-foreground/70 hover:text-foreground"
      >
        <Plus className="size-3" />
        ghi chú
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-1 font-normal">
      <Textarea
        name="extra_information"
        defaultValue={note ?? ""}
        placeholder={placeholder}
        className="min-h-16 text-xs"
        maxLength={1000}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <div className="flex items-center gap-1">
        <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu ghi chú"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Huỷ
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </form>
  );
}
