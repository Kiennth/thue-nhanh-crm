"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { setOrderDepositOverride } from "@/lib/actions/orders";

const vnd = new Intl.NumberFormat("vi-VN");

// Sửa tay tiền cọc của đơn (CEO 2026-10-04: "khách quen cọc 5tr thay vì
// 26tr"). Ghi vào orders.deposit_override_amount — trang đơn, chứng từ, QR
// đều lấy số này; "Về mặc định" xoá ghi đè, quay về cọc tính theo hàng.
export function DepositOverrideDialog({
  orderId,
  current,
  defaultAmount,
  overridden,
}: {
  orderId: string;
  current: number;
  defaultAmount: number;
  overridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(vnd.format(current));
  const [pending, start] = useTransition();

  function save(amount: number | null) {
    start(async () => {
      const r = await setOrderDepositOverride(orderId, amount);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success(amount === null ? "Đã trả cọc về mặc định" : `Đã sửa cọc thành ${vnd.format(amount)}đ`);
        setOpen(false);
      }
    });
  }

  const parsed = Number(value.replace(/\D/g, ""));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(vnd.format(current));
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
            <Pencil className="size-3" />
            Sửa
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sửa tiền cọc của đơn</DialogTitle>
          <DialogDescription>
            Cọc tính theo hàng: {vnd.format(defaultAmount)}đ. Nhập số khác cho khách quen, nhập 0 nếu miễn cọc.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setValue(digits ? vnd.format(Number(digits)) : "");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value !== "") save(parsed);
            }}
            className="text-right text-lg font-semibold tabular-nums"
          />
          <span className="text-sm text-muted-foreground">đ</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[0, 1_000_000, 2_000_000, 5_000_000, 10_000_000].map((n) => (
            <Button key={n} type="button" size="sm" variant="outline" onClick={() => setValue(vnd.format(n))}>
              {n === 0 ? "Miễn cọc" : `${n / 1_000_000}tr`}
            </Button>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {overridden ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => save(null)}>
              Về mặc định
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" disabled={pending || value === ""} onClick={() => save(parsed)}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
