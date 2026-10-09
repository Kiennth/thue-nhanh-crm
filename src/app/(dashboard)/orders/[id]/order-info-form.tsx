"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrderContactInfo } from "@/lib/actions/orders";
import { CustomerCombobox } from "../customer-combobox";
import { OrdererSuggestInput, fillOrdererFields } from "@/components/orderer-suggest-input";
import { useUnsavedSection, UNSAVED_RING } from "@/components/unsaved-changes";
import { cn } from "@/lib/utils";

interface OrderInfoFormProps {
  orderId: string;
  customer: { id: string; name: string } | null;
  ordererName: string | null;
  ordererPhone: string | null;
  ordererEmail: string | null;
  // Hồ sơ người đặt (tự gắn theo SĐT) — chỉ hiện link với vai trò được xem.
  ordererProfileId?: string | null;
}

// Sửa nhanh khách hàng + người đặt hàng ngay tại trang xem đơn — khách agency
// thường có nhiều nhân sự khác nhau đặt cho từng đơn, cần đổi lại được mà
// không phải mở dialog "Sửa đơn hàng" đầy đủ.
export function OrderInfoForm({
  orderId,
  customer,
  ordererName,
  ordererPhone,
  ordererEmail,
  ordererProfileId,
}: OrderInfoFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Thanh "chưa lưu": so giá trị form hiện tại với lúc mở/lưu gần nhất.
  const snapRef = useRef("");
  const [dirty, setDirty] = useState(false);
  const snapshot = () =>
    formRef.current ? JSON.stringify([...new FormData(formRef.current)].map(([k, v]) => [k, String(v)])) : "";
  useEffect(() => {
    snapRef.current = snapshot();
  }, []);
  const recheck = () => setTimeout(() => setDirty(snapshot() !== snapRef.current), 0);
  useUnsavedSection("order-info", "Khách & người đặt", dirty, () => formRef.current?.requestSubmit());

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateOrderContactInfo(orderId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        snapRef.current = snapshot();
        setDirty(false);
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      onInput={recheck}
      onChange={recheck}
      onClick={recheck}
      className={cn("col-span-2 space-y-3", dirty && UNSAVED_RING)}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="customer_id">Khách hàng</Label>
            {/* Nhảy thẳng tới hồ sơ khách để sửa SĐT/địa chỉ/MST mà không
                phải tự mò sang trang Khách hàng (CEO 2026-09-02). */}
            {customer && (
              <Link
                href={`/customers/${customer.id}`}
                className="text-xs text-primary hover:underline"
              >
                Mở hồ sơ khách →
              </Link>
            )}
          </div>
          <CustomerCombobox name="customer_id" defaultCustomer={customer ?? undefined} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="orderer_name">Người đặt hàng</Label>
            {ordererProfileId && (
              <Link href={`/orderers/${ordererProfileId}`} className="text-xs text-primary hover:underline">
                Hồ sơ người đặt →
              </Link>
            )}
          </div>
          <OrdererSuggestInput
            id="orderer_name"
            name="orderer_name"
            placeholder="Không bắt buộc — gõ tên để tìm"
            defaultValue={ordererName ?? ""}
            onPick={(o) => fillOrdererFields(formRef.current, o)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="orderer_phone">SĐT người đặt</Label>
          <OrdererSuggestInput
            id="orderer_phone"
            name="orderer_phone"
            placeholder="Không bắt buộc — gõ SĐT để tìm"
            defaultValue={ordererPhone ?? ""}
            onPick={(o) => fillOrdererFields(formRef.current, o)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="orderer_email">Email người đặt</Label>
          <Input
            id="orderer_email"
            name="orderer_email"
            type="email"
            placeholder="Không bắt buộc"
            defaultValue={ordererEmail ?? ""}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-primary">Đã lưu.</p>}

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu"}
      </Button>
    </form>
  );
}
