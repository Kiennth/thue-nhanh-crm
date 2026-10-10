"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Handshake, Loader2, PackageCheck, Truck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  closeOrderDeal,
  pickupOrder,
  returnOrder,
  undoConfirm,
  undoPickup,
  undoReturn,
} from "@/lib/actions/orders";
import { cn } from "@/lib/utils";

// Luồng đơn 4 bước kiểu Booqable (CEO 2026-10-11): Đã báo giá → Chốt đơn →
// Giao máy → Nhận lại máy. Mỗi lúc chỉ 1 nút cho bước kế tiếp; bước vừa làm
// có "Hoàn tác" (quản lý + Cửa hàng trưởng). 10 khâu tính lương nằm riêng
// bên dưới, tick lúc nào cũng được — không chặn luồng này.

type Employee = { id: string; name: string };

const fmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : null);

// Giá trị ô datetime-local theo giờ máy người dùng.
function localInputNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrderFlowBar({
  orderId,
  createdAt,
  confirmedAt,
  deliveredAt,
  returnedAt,
  delivered,
  returned,
  plannedStart,
  plannedEnd,
  canUndo,
  dealEmployees,
  pickupEmployees,
  returnEmployees,
  currentEmployeeId,
}: {
  orderId: string;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  delivered: boolean;
  returned: boolean;
  plannedStart: string | null;
  plannedEnd: string | null;
  canUndo: boolean;
  dealEmployees: Employee[];
  pickupEmployees: Employee[];
  returnEmployees: Employee[];
  currentEmployeeId: string | null;
}) {
  const confirmed = !!confirmedAt || delivered;
  const current = returned ? 4 : delivered ? 3 : confirmed ? 2 : 1;
  const [pending, startTransition] = useTransition();
  const [dealEmployee, setDealEmployee] = useState(currentEmployeeId ?? dealEmployees[0]?.id ?? "");
  const [dialog, setDialog] = useState<null | "pickup" | "return" | "undo">(null);
  const [at, setAt] = useState("");
  const [who, setWho] = useState("");

  const steps = [
    { n: 1, title: "Đã báo giá", sub: "chưa chốt", date: when(createdAt) },
    { n: 2, title: "Chốt đơn", sub: "giữ máy", date: when(confirmedAt) },
    { n: 3, title: "Giao máy", sub: plannedStart ? `dự kiến ${when(plannedStart)}` : "", date: when(deliveredAt) },
    { n: 4, title: "Nhận lại máy", sub: plannedEnd ? `dự kiến ${when(plannedEnd)}` : "", date: when(returnedAt) },
  ];

  function run(fn: () => Promise<{ error?: string } | { success: true } | undefined | void>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) toast.error(r.error);
      else {
        toast.success(ok);
        setDialog(null);
      }
    });
  }

  function openFlowDialog(kind: "pickup" | "return") {
    setAt(localInputNow());
    setWho(currentEmployeeId ?? "");
    setDialog(kind);
  }

  const undoLabel = returned ? "Nhận lại máy" : delivered ? "Giao máy" : "Chốt đơn";
  const flowEmployees = dialog === "return" ? returnEmployees : pickupEmployees;

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s) => {
          const done = s.n < current || (s.n === 4 && returned);
          const active = s.n === current && !returned;
          return (
            <li
              key={s.n}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-2",
                done && "border-primary/30 bg-primary/5",
                active && "border-primary ring-2 ring-primary/15",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : s.n}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", !done && !active && "text-muted-foreground")}>
                  {s.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {done && s.date ? s.date : s.sub}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {current === 1 && (
          <>
            <select
              value={dealEmployee}
              onChange={(e) => setDealEmployee(e.target.value)}
              className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
              aria-label="Người chốt đơn (ghi khoán 3 khâu đầu)"
            >
              {dealEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <Button
              disabled={pending || !dealEmployee}
              onClick={() => run(() => closeOrderDeal(orderId, dealEmployee), "Đã chốt đơn — máy được giữ cho đơn")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />}
              Chốt đơn
            </Button>
          </>
        )}
        {current === 2 && (
          <Button disabled={pending} onClick={() => openFlowDialog("pickup")}>
            <Truck className="size-4" />
            Giao máy
          </Button>
        )}
        {current === 3 && (
          <Button disabled={pending} onClick={() => openFlowDialog("return")}>
            <PackageCheck className="size-4" />
            Nhận lại máy
          </Button>
        )}
        {current === 4 && <span className="text-sm font-medium text-primary">Đơn đã hoàn tất — máy đã về kho.</span>}
        {canUndo && current > 1 && (
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setDialog("undo")}>
            <Undo2 className="size-4" />
            Hoàn tác {undoLabel.toLowerCase()}
          </Button>
        )}
      </div>

      <Dialog open={dialog === "pickup" || dialog === "return"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "return" ? "Nhận lại máy" : "Giao máy"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dialog === "return"
              ? "Máy của đơn về kho thu hồi, đơn hoàn tất. Tiền còn nợ / cọc chưa hoàn vẫn theo dõi ở Công nợ."
              : "Máy của đơn chuyển sang “đang cho thuê” (máy serial chưa gán sẽ được tự gán). Ngày giao là ngày ghi doanh số."}
          </p>
          <label className="block text-sm">
            <span className="font-medium">{dialog === "return" ? "Giờ nhận lại" : "Giờ giao"}</span>
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{dialog === "return" ? "Người thu hồi" : "Người giao"}</span>
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">— Ghi khoán sau —</option>
              {flowEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Chọn người thì tick luôn khâu “{dialog === "return" ? "Thu hồi" : "Giao hàng & bàn giao"}” để tính khoán.
            </span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Thôi
            </Button>
            <Button
              disabled={pending || !at}
              onClick={() => {
                const input = { orderId, at: new Date(at).toISOString(), employeeId: who || undefined };
                if (dialog === "return") run(() => returnOrder(input), "Đã nhận lại máy — đơn hoàn tất");
                else run(() => pickupOrder(input), "Đã giao máy");
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "undo"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hoàn tác “{undoLabel}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {returned
              ? "Máy quay lại trạng thái “đang ở khách”, đơn mở lại."
              : delivered
                ? "Máy quay lại kho giao, đơn về “Đã chốt · chờ giao”. Ngày ghi doanh số bị xoá."
                : "Đơn về “Đã báo giá (chưa chốt)”, máy không còn được giữ."}{" "}
            Khâu khoán đã tick giữ nguyên.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Không
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => (returned ? undoReturn(orderId) : delivered ? undoPickup(orderId) : undoConfirm(orderId)),
                  `Đã hoàn tác ${undoLabel.toLowerCase()}`,
                )
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Hoàn tác
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
