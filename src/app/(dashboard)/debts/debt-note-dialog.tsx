"use client";

import { useRef, useState, useTransition } from "react";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDebtNote } from "@/lib/actions/debts";

export interface DebtNoteRow {
  id: string;
  note: string;
  created_at: string;
  authorName: string | null;
}

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Nhật ký đòi nợ của 1 khách — xem các lần gọi trước + ghi lần mới.
// Append-only: không sửa được ghi chú cũ (sổ ghi chép).
export function DebtNoteDialog({
  customerId,
  customerName,
  notes,
}: {
  customerId: string;
  customerName: string;
  notes: DebtNoteRow[];
}) {
  const trigger = (
    <Button variant="outline" size="sm">
      <NotebookPen className="size-4" />
      Ghi chú{notes.length > 0 && ` (${notes.length})`}
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addDebtNote(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        toast.success("Đã ghi vào nhật ký đòi nợ.");
        formRef.current?.reset();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhật ký đòi nợ — {customerName}</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-3">
          <input type="hidden" name="customer_id" value={customerId} />
          <div className="space-y-2">
            <Label htmlFor="debt_note">Ghi chú lần liên hệ này</Label>
            <Input
              id="debt_note"
              name="note"
              placeholder="Vd: Đã gọi 9/8, khách hẹn chuyển khoản trước 15/8"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Ghi vào sổ"}
          </Button>
        </form>

        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Các lần trước</p>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có ghi chú nào cho khách này.</p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border p-2 text-sm">
                  <p>{n.note}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateTimeFormatter.format(new Date(n.created_at))}
                    {n.authorName ? ` · ${n.authorName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
