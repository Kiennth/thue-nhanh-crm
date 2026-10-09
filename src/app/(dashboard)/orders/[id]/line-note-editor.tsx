"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderLineExtraInfo } from "@/lib/actions/orders";
import { useUnsavedSection } from "@/components/unsaved-changes";

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
  // B1: sửa ghi chú xong lưu bằng thanh "Lưu thay đổi" chung (Cmd/Ctrl+Enter
  // cũng lưu). Trang tải lại sau khi lưu → ô theo ghi chú mới.
  const [text, setText] = useState(note ?? "");
  const [prevNote, setPrevNote] = useState(note);
  if (prevNote !== note) {
    setPrevNote(note);
    setText(note ?? "");
  }
  const dirty = canEdit && text !== (note ?? "");
  useUnsavedSection(`note:${lineIds.join(",")}`, "Ghi chú dòng", dirty, save);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("extra_information", text);
    startTransition(async () => {
      const result = await updateOrderLineExtraInfo(lineIds, undefined, fd);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  function discard() {
    setText(note ?? "");
    setError(null);
    setEditing(false);
  }

  if (!canEdit) {
    return note ? (
      <p className="text-xs font-normal whitespace-pre-wrap text-muted-foreground">{note}</p>
    ) : null;
  }

  if (!editing && !dirty) {
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
    <div className="space-y-1 font-normal">
      <Textarea
        name="extra_information"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className={dirty ? "min-h-16 border-amber-400 bg-[#FFFBEB] text-xs dark:bg-amber-950/30" : "min-h-16 text-xs"}
        maxLength={1000}
        disabled={pending}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (dirty) save();
          }
          if (e.key === "Escape") discard();
        }}
      />
      <div className="flex items-center gap-1">
        {pending && <span className="px-1 text-xs text-muted-foreground">Đang lưu…</span>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={discard}
          disabled={pending}
        >
          {dirty ? "Bỏ sửa" : "Đóng"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
