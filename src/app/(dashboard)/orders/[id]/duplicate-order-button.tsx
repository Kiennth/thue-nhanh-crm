"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/date-input";
import { duplicateOrder } from "@/lib/actions/orders";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const pad = (n: number) => String(n).padStart(2, "0");
const datePart = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmyHm = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())} ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

// Nhân bản kèm chọn luôn giờ bắt đầu mới (CEO 2026-10-05) — giờ trả dời theo,
// giữ nguyên thời lượng thuê; đơn mới tạo ra đã đúng ngày, khỏi sửa lại.
export function DuplicateOrderButton({
  orderId,
  rentalStartAt,
  rentalEndAt,
}: {
  orderId: string;
  rentalStartAt: string | null;
  rentalEndAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const oldStart = rentalStartAt ? new Date(rentalStartAt) : null;
  const oldEnd = rentalEndAt ? new Date(rentalEndAt) : null;
  const [date, setDate] = useState(() => (oldStart ? datePart(oldStart) : ""));
  const [hour, setHour] = useState(() => (oldStart ? pad(oldStart.getHours()) : "09"));

  const newStart = oldStart && date ? new Date(`${date}T${hour}:${pad(oldStart.getMinutes())}:00`) : null;
  const newEnd =
    newStart && oldStart && oldEnd && !Number.isNaN(newStart.getTime())
      ? new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()))
      : null;

  function run(startAt?: string) {
    startTransition(async () => {
      const result = await duplicateOrder(orderId, startAt);
      if (result && "error" in result) toast.error(result.error);
    });
  }

  if (!oldStart) {
    return (
      <Button variant="outline" onClick={() => run()} disabled={pending}>
        <Copy className="size-4" />
        {pending ? "Đang tạo..." : "Nhân bản"}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={pending}>
        <Copy className="size-4" />
        {pending ? "Đang tạo..." : "Nhân bản"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nhân bản đơn</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Giữ nguyên khách, hàng, giá, cọc. Chọn giờ nhận mới — giờ trả tự dời theo, giữ nguyên thời lượng thuê.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="dup_start_date">Nhận hàng</Label>
            <div className="flex gap-2">
              <DateInput id="dup_start_date" value={date} onChange={(e) => setDate(e.target.value)} />
              <select
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                aria-label="Giờ nhận"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}:{pad(oldStart.getMinutes())}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Trả hàng:</span>{" "}
            <b>{newEnd ? dmyHm(newEnd) : "—"}</b>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => run()} disabled={pending}>
              Giữ ngày cũ
            </Button>
            <Button onClick={() => newStart && run(newStart.toISOString())} disabled={pending || !newEnd}>
              {pending ? "Đang tạo..." : "Nhân bản"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
