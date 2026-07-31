"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { overrideOrderTotal } from "@/lib/actions/orders";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Giảm giá không phải một trường riêng trong CSDL: nó chỉ là lối tắt của ô
// "Sửa tay doanh số" ngay bên cạnh — nhập số tiền muốn bớt thay vì phải tự
// trừ rồi gõ ra con số cuối. Cùng dùng lại overrideOrderTotal nên vẫn giữ
// nguyên luật: phần giảm chỉ phân bổ vào các dòng CHO THUÊ, không đụng dòng
// dịch vụ hay bán hàng.
export function OrderDiscountForm({
  orderId,
  totalValue,
  rentalSubtotal,
}: {
  orderId: string;
  totalValue: number;
  // Tổng các dòng cho thuê — mốc để tính phần trăm. Lấy % trên tổng đơn sẽ
  // sai, vì phần dịch vụ/bán hàng không được giảm.
  rentalSubtotal: number;
}) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"vnd" | "percent">("vnd");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const raw = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(raw) && raw > 0;
  const discount = !valid
    ? 0
    : unit === "percent"
      ? Math.round((rentalSubtotal * raw) / 100)
      : Math.round(raw);
  const remaining = totalValue - discount;
  const tooLarge = discount > rentalSubtotal;

  function handleSubmit() {
    setError(null);
    if (!valid) {
      setError("Nhập số tiền hoặc phần trăm muốn giảm.");
      return;
    }
    if (tooLarge) {
      setError("Số tiền giảm vượt quá tổng các dòng cho thuê.");
      return;
    }
    const formData = new FormData();
    formData.set("total_value", String(remaining));
    startTransition(async () => {
      const result = await overrideOrderTotal(orderId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setAmount("");
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="order-discount">
            Giảm giá
          </label>
          <div className="flex gap-2">
            <Input
              id="order-discount"
              type="number"
              min={0}
              step={unit === "percent" ? 1 : 1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-28"
            />
            <Select value={unit} onValueChange={(v) => setUnit((v as "vnd" | "percent") ?? "vnd")}>
              <SelectTrigger className="w-20">
                <SelectValue>{(v: string) => (v === "percent" ? "%" : "đ")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vnd">đ</SelectItem>
                <SelectItem value="percent">%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSubmit}
          disabled={pending || !valid || tooLarge}
        >
          {pending ? "..." : "Áp dụng"}
        </Button>
      </div>

      {/* Xem trước ngay khi gõ: đỡ phải bấm rồi mới biết mình giảm nhầm. */}
      <p className="text-xs text-muted-foreground">
        {valid ? (
          tooLarge ? (
            <span className="text-destructive">
              Giảm {currencyFormatter.format(discount)}đ vượt quá tổng cho thuê{" "}
              {currencyFormatter.format(rentalSubtotal)}đ.
            </span>
          ) : (
            <>
              Bớt {currencyFormatter.format(discount)}đ khỏi các dòng cho thuê — doanh số còn{" "}
              <span className="font-medium text-foreground">
                {currencyFormatter.format(remaining)}đ
              </span>
              .
            </>
          )
        ) : (
          <>Trừ thẳng vào các dòng cho thuê (đang có {currencyFormatter.format(rentalSubtotal)}đ).</>
        )}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
