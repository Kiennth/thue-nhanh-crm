"use client";

import { useState, useTransition } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  updateComboLinePrice,
  updateOrderEquipmentLinePrice,
  updateOrderEquipmentLinesPrice,
  updateOrderLineChargeDuration,
} from "@/lib/actions/orders";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export type LinePriceTarget =
  | { kind: "single"; lineId: string }
  | { kind: "group"; lineIds: string[] }
  | { kind: "combo"; parentLineId: string };

// Ô "Tính tiền" của dòng — gộp số kỳ tính tiền + đơn giá vào 1 ô như cột
// "Charge" của Booqable (CEO 2026-09-30: team quen kiểu đó, tách 2 cột bị
// chật). Bình thường là 1 nút hiện "3 ngày · 700.000đ"; bấm vào mới mở 2 ô
// nhập. Đổi số kỳ thì giá tự tính lại từ giá gốc; chỉ đổi giá thì là giá tay.
export function LineChargeEditor({
  durationLineIds,
  priceTarget,
  duration,
  autoDuration,
  isDurationCustom,
  unitLabel,
  unitPrice,
  priceSuffix,
  description,
  isPriceCustom,
  defaultUnitPrice,
  canEdit,
}: {
  durationLineIds: string[];
  priceTarget: LinePriceTarget;
  // null = dòng không tính theo kỳ (dịch vụ / bán / dòng tự do) — chỉ có giá.
  duration: number | null;
  autoDuration: number | null;
  isDurationCustom: boolean;
  unitLabel: string | null;
  unitPrice: number;
  priceSuffix?: string;
  description?: string | null;
  isPriceCustom?: boolean;
  defaultUnitPrice?: number | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasDuration = duration != null && unitLabel != null;
  const summary = (
    <>
      {hasDuration && (
        <span className={cn(isDurationCustom && "font-semibold text-amber-600 dark:text-amber-500")}>
          {duration} {unitLabel}
        </span>
      )}
      {hasDuration && <span className="text-muted-foreground/60">·</span>}
      <span className="tabular-nums">
        {currencyFormatter.format(unitPrice)}đ{priceSuffix}
      </span>
    </>
  );

  function savePrice(formData: FormData) {
    if (priceTarget.kind === "single") {
      return updateOrderEquipmentLinePrice(priceTarget.lineId, undefined, formData);
    }
    if (priceTarget.kind === "group") {
      return updateOrderEquipmentLinesPrice(priceTarget.lineIds, undefined, formData);
    }
    return updateComboLinePrice(priceTarget.parentLineId, undefined, formData);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    const nextDuration = String(formData.get("charge_duration") ?? "");
    const nextPrice = String(formData.get("unit_price") ?? "");
    const durationChanged = hasDuration && nextDuration !== String(duration);
    const priceChanged = nextPrice !== "" && Number(nextPrice) !== unitPrice;

    startTransition(async () => {
      // Đổi số kỳ trước (giá tự tính lại theo giá gốc); nếu người dùng còn gõ
      // giá khác thì áp giá tay sau cùng.
      if (durationChanged) {
        const fd = new FormData();
        fd.set("charge_duration", nextDuration);
        const result = await updateOrderLineChargeDuration(durationLineIds, undefined, fd);
        if (result && "error" in result) return setError(result.error);
      }
      if (priceChanged) {
        const fd = new FormData();
        fd.set("unit_price", nextPrice);
        const result = await savePrice(fd);
        if (result && "error" in result) return setError(result.error);
      }
      setEditing(false);
    });
  }

  function resetDuration() {
    setError(null);
    const fd = new FormData();
    fd.set("charge_duration", "");
    startTransition(async () => {
      const result = await updateOrderLineChargeDuration(durationLineIds, undefined, fd);
      if (result && "error" in result) setError(result.error);
      else setEditing(false);
    });
  }

  const notes = (
    <>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {isDurationCustom && autoDuration != null && (
        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
          Khách thuê {autoDuration} {unitLabel}, tính {duration} {unitLabel}
        </p>
      )}
      {isPriceCustom && (
        <p
          className="mt-0.5 text-xs text-amber-600 dark:text-amber-500"
          title={
            defaultUnitPrice != null
              ? `Giá theo gói mặc định: ${currencyFormatter.format(defaultUnitPrice)}đ`
              : undefined
          }
        >
          Giá tuỳ chỉnh
        </p>
      )}
    </>
  );

  if (!canEdit) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-sm">{summary}</div>
        {notes}
      </div>
    );
  }

  if (!editing) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm hover:bg-muted/60"
          title="Bấm để sửa số kỳ tính tiền / đơn giá"
        >
          <span className="flex min-w-0 items-center gap-1.5">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {notes}
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-1.5 rounded-lg border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {hasDuration && (
          <>
            <Input
              name="charge_duration"
              type="number"
              min={0.5}
              step={0.5}
              defaultValue={duration}
              className="h-8 w-16"
              aria-label={`Số ${unitLabel} tính tiền`}
              autoFocus
            />
            <span className="text-xs text-muted-foreground">{unitLabel} ·</span>
          </>
        )}
        <Input
          name="unit_price"
          type="number"
          min={0}
          step={1000}
          defaultValue={unitPrice}
          className="h-8 w-28"
          aria-label="Đơn giá"
          autoFocus={!hasDuration}
        />
        <span className="text-xs text-muted-foreground">đ{priceSuffix}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="submit" size="sm" className="h-7 px-2.5 text-xs" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Huỷ
        </Button>
        {isDurationCustom && autoDuration != null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={resetDuration}
            disabled={pending}
            title={`Về lại ${autoDuration} ${unitLabel} theo thời gian thuê`}
          >
            <RotateCcw className="size-3" />
            Về {autoDuration} {unitLabel}
          </Button>
        )}
      </div>
      {hasDuration && (
        <p className="text-xs text-muted-foreground">
          Đổi số {unitLabel} thì giá tự tính lại; chỉ sửa giá thì giữ giá tay.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
