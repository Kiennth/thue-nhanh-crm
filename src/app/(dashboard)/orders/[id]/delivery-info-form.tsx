"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrderDeliveryInfo } from "@/lib/actions/orders";
import type { DeliveryContact } from "@/lib/delivery-contact";

type Contact = { address: string; name: string; phone: string };

// Ô giao hàng + trả hàng của đơn (CEO 2026-10-05) — biên bản giao/thu hồi,
// lịch, lịch làm việc lấy thẳng từ đây. Đơn chưa điền giao hàng thì điền sẵn
// gợi ý (dòng phí giao + người đặt), bấm Lưu để chốt. Trả hàng mặc định
// "Giống lúc giao" (3 cột trả hàng để trống).
export function DeliveryInfoForm({
  orderId,
  address,
  name,
  phone,
  suggested,
  returnContact,
}: {
  orderId: string;
  address: string | null;
  name: string | null;
  phone: string | null;
  suggested: DeliveryContact;
  returnContact: { address: string | null; name: string | null; phone: string | null };
}) {
  const saved = !!(address || name || phone);
  const [values, setValues] = useState<Contact>({
    address: address ?? (saved ? "" : (suggested.address ?? "")),
    name: name ?? (saved ? "" : (suggested.name ?? "")),
    phone: phone ?? (saved ? "" : (suggested.phone ?? "")),
  });
  const savedSame = !(returnContact.address || returnContact.name || returnContact.phone);
  const [sameReturn, setSameReturn] = useState(savedSame);
  const [ret, setRet] = useState<Contact>({
    address: returnContact.address ?? "",
    name: returnContact.name ?? "",
    phone: returnContact.phone ?? "",
  });
  const [pending, startTransition] = useTransition();
  const isSuggestion = !saved && !!(values.address || values.name || values.phone);
  const dirty =
    values.address !== (address ?? "") ||
    values.name !== (name ?? "") ||
    values.phone !== (phone ?? "") ||
    sameReturn !== savedSame ||
    (!sameReturn &&
      (ret.address !== (returnContact.address ?? "") ||
        ret.name !== (returnContact.name ?? "") ||
        ret.phone !== (returnContact.phone ?? "")));

  function save() {
    startTransition(async () => {
      const result = await updateOrderDeliveryInfo(orderId, {
        ...values,
        returnInfo: sameReturn ? null : ret,
      });
      if (result && "error" in result) toast.error(result.error);
      else toast.success("Đã lưu thông tin giao/trả hàng.");
    });
  }

  function toggleSame(checked: boolean) {
    setSameReturn(checked);
    // Bỏ tick lần đầu: điền sẵn theo lúc giao cho đỡ gõ lại, sửa phần khác.
    if (!checked && !ret.address && !ret.name && !ret.phone) setRet(values);
  }

  const field =
    <T extends Contact>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof Contact) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter((v) => ({ ...v, [key]: e.target.value }));

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
          onChange={field(setValues, "address")}
          placeholder="Để trống = khách tự đến kho lấy"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="receiver_name">Tên người nhận</Label>
          <Input id="receiver_name" value={values.name} onChange={field(setValues, "name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="receiver_phone">SĐT người nhận</Label>
          <Input id="receiver_phone" inputMode="tel" value={values.phone} onChange={field(setValues, "phone")} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <PackageCheck className="size-4 text-emerald-600" />
          Trả hàng
        </p>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={sameReturn} onChange={(e) => toggleSame(e.target.checked)} />
          Giống lúc giao
        </label>
      </div>
      {!sameReturn && (
        <>
          <div className="space-y-1">
            <Label htmlFor="return_address">Địa chỉ trả hàng</Label>
            <Input
              id="return_address"
              value={ret.address}
              onChange={field(setRet, "address")}
              placeholder="Để trống = như địa chỉ nhận hàng"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="return_contact_name">Tên người trả hàng</Label>
              <Input id="return_contact_name" value={ret.name} onChange={field(setRet, "name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="return_contact_phone">SĐT người trả hàng</Label>
              <Input
                id="return_contact_phone"
                inputMode="tel"
                value={ret.phone}
                onChange={field(setRet, "phone")}
              />
            </div>
          </div>
        </>
      )}
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
