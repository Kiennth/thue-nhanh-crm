"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewEquipmentDeposit } from "@/lib/actions/equipment";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Hộp vàng "Cọc 0đ – cần xem" (B7, Grok CRM 09/10): mã đắt tiền / nhóm giá
// trị cao đang để cọc 0 (web hiện "Không cần cọc"). Giữ 0đ · đã xem → bỏ cờ;
// Nhập số cọc → lưu số tiền. Đổi giá / cọc về 0 sau đó thì trigger gắn cờ lại.
export function DepositReviewBox({ id, pricePerDay }: { id: string; pricePerDay: number }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");

  const submit = (value: number | null) =>
    startTransition(async () => {
      const res = await reviewEquipmentDeposit(id, value);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      // Server action đã revalidatePath → không refresh thêm (đỡ dựng trang 2 lần).
      toast.success(value ? `Đã lưu cọc ${vnd.format(value)}đ.` : "Đã giữ Không cần cọc · đã xem.");
    });

  const parsed = Number(amount.replace(/\D/g, ""));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <TriangleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <b>Cọc 0đ – cần xem:</b> giá thuê {vnd.format(pricePerDay)}đ/ngày mà cọc đang 0 — web hiện &quot;Không cần
        cọc&quot;.
      </span>
      {editing ? (
        <span className="flex items-center gap-2">
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="Số cọc (đ)"
            value={amount ? vnd.format(parsed) : ""}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-36 bg-background"
          />
          <Button size="sm" disabled={pending || !(parsed > 0)} onClick={() => submit(parsed)}>
            Lưu cọc
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Đóng
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => submit(null)} className="bg-background">
            Giữ 0đ · đã xem
          </Button>
          <Button size="sm" disabled={pending} onClick={() => setEditing(true)}>
            Nhập số cọc
          </Button>
        </span>
      )}
    </div>
  );
}
