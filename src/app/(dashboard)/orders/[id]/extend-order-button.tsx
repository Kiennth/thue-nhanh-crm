"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/date-input";
import { extendOrder } from "@/lib/actions/orders";
import { cn } from "@/lib/utils";

const fmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const vnParts = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
};

// Nút "Gia hạn" (CEO 2026-10-05): khách đang giữ máy muốn thuê thêm → tạo đơn
// nối tiếp (giữ máy, giữ đơn giá/ngày, cọc 0) rồi mở đơn mới để gửi báo giá.
export function ExtendOrderButton({
  orderId,
  rentalStartAt,
  rentalEndAt,
}: {
  orderId: string;
  rentalStartAt: string;
  rentalEndAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const endMs = Date.parse(rentalEndAt);
  const oldSpan = endMs - Date.parse(rentalStartAt);
  const addMonth = () => {
    const p = vnParts(rentalEndAt);
    const [y, m, d] = p.date.split("-").map(Number);
    const target = new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
    return new Date(`${target.toISOString().slice(0, 10)}T${p.time}:00+07:00`).toISOString();
  };
  const options = [
    { key: "7", label: "+1 tuần", iso: new Date(endMs + 7 * 86_400_000).toISOString() },
    { key: "14", label: "+2 tuần", iso: new Date(endMs + 14 * 86_400_000).toISOString() },
    { key: "month", label: "+1 tháng", iso: addMonth() },
    { key: "same", label: "Bằng kỳ trước", iso: new Date(endMs + oldSpan).toISOString() },
  ];
  const [choice, setChoice] = useState("month");
  const [customDate, setCustomDate] = useState(vnParts(addMonth()).date);
  const endTime = vnParts(rentalEndAt).time;
  const newEnd =
    choice === "custom"
      ? new Date(`${customDate}T${endTime}:00+07:00`).toISOString()
      : options.find((o) => o.key === choice)!.iso;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <CalendarPlus2 className="size-4" />
            Gia hạn
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gia hạn đơn</DialogTitle>
          <DialogDescription>
            Tạo đơn nối tiếp: giữ nguyên máy đang ở chỗ khách, giữ đơn giá/ngày, cọc 0, không phí giao/thu hồi. Tạo
            xong mở đơn mới để gửi báo giá cho khách.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {[...options, { key: "custom", label: "Chọn ngày…", iso: "" }].map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setChoice(o.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium",
                choice === o.key ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {choice === "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-sm">Trả ngày</span>
            <DateInput value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">lúc {endTime}</span>
          </div>
        )}
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p>
            Nhận: <b>{fmt.format(new Date(rentalEndAt))}</b>
          </p>
          <p>
            Trả: <b>{fmt.format(new Date(newEnd))}</b>
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await extendOrder(orderId, newEnd);
                if ("error" in r) toast.error(r.error);
                else {
                  toast.success(`Đã tạo đơn gia hạn ${r.code} — gửi Link báo giá cho khách`);
                  setOpen(false);
                  router.push(`/orders/${r.id}`);
                }
              })
            }
          >
            {pending ? "Đang tạo..." : "Tạo đơn gia hạn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
