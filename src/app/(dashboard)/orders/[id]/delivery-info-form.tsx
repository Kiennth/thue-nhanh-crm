"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrderDeliveryInfo } from "@/lib/actions/orders";
import type { DeliveryContact } from "@/lib/delivery-contact";

// 3 ô giao hàng của đơn (CEO 2026-10-05) — biên bản giao hàng, lịch, lịch
// làm việc lấy thẳng từ đây. Đơn chưa điền thì điền sẵn gợi ý (dòng phí
// giao + người đặt), bấm Lưu để chốt.
export function DeliveryInfoForm({
  orderId,
  address,
  name,
  phone,
  suggested,
}: {
  orderId: string;
  address: string | null;
  name: string | null;
  phone: string | null;
  suggested: DeliveryContact;
}) {
  const saved = !!(address || name || phone);
  const [values, setValues] = useState({
    address: address ?? (saved ? "" : (suggested.address ?? "")),
    name: name ?? (saved ? "" : (suggested.name ?? "")),
    phone: phone ?? (saved ? "" : (suggested.phone ?? "")),
  });
  const [pending, startTransition] = useTransition();
  const isSuggestion = !saved && !!(values.address || values.name || values.phone);
  const dirty =
    values.address !== (address ?? "") || values.name !== (name ?? "") || values.phone !== (phone ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateOrderDeliveryInfo(orderId, values);
      if (result && "error" in result) toast.error(result.error);
      else toast.success("Đã lưu thông tin giao hàng.");
    });
  }

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Truck className="size-4 text-sky-600" />
        Giao hàng
        {isSuggestion && (
          <span className="text-xs font-normal text-amber-700 dark:text-amber-300">
            · gợi ý từ dòng phí giao/người đặt — bấm Lưu để chốt
          </span>
        )}
      </p>
      <div className="space-y-1">
        <Label htmlFor="delivery_address">Địa chỉ nhận hàng</Label>
        <Input
          id="delivery_address"
          value={values.address}
          onChange={set("address")}
          placeholder="Để trống = khách tự đến kho lấy"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="receiver_name">Tên người nhận</Label>
          <Input id="receiver_name" value={values.name} onChange={set("name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="receiver_phone">SĐT người nhận</Label>
          <Input id="receiver_phone" inputMode="tel" value={values.phone} onChange={set("phone")} />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || (!dirty && !isSuggestion)}
        onClick={save}
      >
        {pending ? "Đang lưu..." : "Lưu"}
      </Button>
    </div>
  );
}
