"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateOrderRentalPeriod } from "@/lib/actions/orders";
import {
  RENTAL_PRESET_OPTIONS,
  computeRentalDurationInUnit,
  defaultRentalStart,
  hoursBetween,
} from "@/lib/rental-pricing";
import { DateInput } from "@/components/date-input";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

function datePart(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hourPart(d: Date) {
  return String(d.getHours()).padStart(2, "0");
}

function combineDateHour(date: string, hour: string): Date {
  return new Date(`${date}T${hour}:00:00`);
}

interface RentalPeriodFormProps {
  orderId: string;
  rentalStartAt: string | null;
  rentalEndAt: string | null;
}

export function RentalPeriodForm({
  orderId,
  rentalStartAt,
  rentalEndAt,
}: RentalPeriodFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"manual" | "preset">("manual");
  const [presetKey, setPresetKey] = useState<string>("1d");

  // Mặc định khi chưa đặt: bắt đầu = hiện tại + 1 tiếng (làm tròn lên giờ
  // chẵn), kết thúc = bắt đầu mặc định + 24h ("1 ngày thuê" mặc định).
  const [defaultStart] = useState(() => defaultRentalStart(new Date()));
  const [startDate, setStartDate] = useState(() =>
    datePart(rentalStartAt ? new Date(rentalStartAt) : defaultStart),
  );
  const [startHour, setStartHour] = useState(() =>
    hourPart(rentalStartAt ? new Date(rentalStartAt) : defaultStart),
  );
  const [endDate, setEndDate] = useState(() =>
    datePart(rentalEndAt ? new Date(rentalEndAt) : new Date(defaultStart.getTime() + 24 * 3_600_000)),
  );
  const [endHour, setEndHour] = useState(() =>
    hourPart(rentalEndAt ? new Date(rentalEndAt) : new Date(defaultStart.getTime() + 24 * 3_600_000)),
  );

  const startAtDate = useMemo(() => combineDateHour(startDate, startHour), [startDate, startHour]);

  // Đổi giờ BẮT ĐẦU → giờ trả dời theo, giữ nguyên thời lượng thuê (CEO
  // 2026-10-05: nhân bản đơn 1 ngày 16:00 05/10, chọn 16:00 20/10 thì trả tự
  // thành 16:00 21/10). Sửa tay giờ trả sau đó vẫn được.
  function changeStart(nextDate: string, nextHour: string) {
    const oldStart = combineDateHour(startDate, startHour).getTime();
    const oldEnd = combineDateHour(endDate, endHour).getTime();
    const nextStart = combineDateHour(nextDate, nextHour).getTime();
    setStartDate(nextDate);
    setStartHour(nextHour);
    const duration = oldEnd - oldStart;
    if (Number.isNaN(nextStart) || Number.isNaN(duration) || duration <= 0) return;
    const nextEnd = new Date(nextStart + duration);
    setEndDate(datePart(nextEnd));
    setEndHour(hourPart(nextEnd));
  }

  const presetEnd = useMemo(() => {
    const preset = RENTAL_PRESET_OPTIONS.find((p) => p.key === presetKey);
    if (!preset) return null;
    return new Date(startAtDate.getTime() + preset.hours * 3_600_000);
  }, [presetKey, startAtDate]);

  const effectiveEndDate = mode === "preset" && presetEnd ? datePart(presetEnd) : endDate;
  const effectiveEndHour = mode === "preset" && presetEnd ? hourPart(presetEnd) : endHour;

  const endAtDate = useMemo(
    () => (mode === "preset" ? presetEnd : combineDateHour(effectiveEndDate, effectiveEndHour)),
    [mode, presetEnd, effectiveEndDate, effectiveEndHour],
  );

  const totalHours = endAtDate ? hoursBetween(startAtDate.toISOString(), endAtDate.toISOString()) : 0;
  const dayCount =
    totalHours > 0 && endAtDate
      ? computeRentalDurationInUnit(startAtDate.toISOString(), endAtDate.toISOString(), "day")
      : 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderRentalPeriod(orderId, undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Áp dụng chung cho mọi thiết bị cho thuê trong đơn — bắt đầu và kết thúc cùng nhau. Đổi giờ bắt
        đầu thì giờ trả tự dời theo, giữ nguyên số ngày thuê.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => setMode("manual")}
        >
          Chọn ngày giờ kết thúc
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "preset" ? "default" : "outline"}
          onClick={() => setMode("preset")}
        >
          Chọn gói có sẵn
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rental_start_date">Bắt đầu thuê</Label>
        <div className="flex gap-2">
          <DateInput
            id="rental_start_date"
            value={startDate}
            onChange={(e) => changeStart(e.target.value, startHour)}
            required
          />
          <Select value={startHour} onValueChange={(value) => changeStart(startDate, value ?? startHour)}>
            <SelectTrigger className="w-24">
              <SelectValue>{(value: string) => `${value}:00`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "manual" ? (
        <div className="space-y-2">
          <Label htmlFor="rental_end_date">Kết thúc thuê</Label>
          <div className="flex gap-2">
            <DateInput
              id="rental_end_date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
            <Select value={endHour} onValueChange={(value) => setEndHour(value ?? endHour)}>
              <SelectTrigger className="w-24">
                <SelectValue>{(value: string) => `${value}:00`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Gói thuê</Label>
          <div className="flex flex-wrap gap-2">
            {/* Trong CRM gói dài hạn ghi gọn "3/6/12 tháng" và luôn hiện (CEO
                2026-10-01) — nhãn "1 tháng (cam kết N tháng)" + giới hạn
                nhóm hàng chỉ áp dụng trên website. */}
            {RENTAL_PRESET_OPTIONS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                size="sm"
                variant={presetKey === preset.key ? "default" : "outline"}
                onClick={() => setPresetKey(preset.key)}
              >
                {preset.commitMonths ? `${preset.commitMonths} tháng` : preset.label}
              </Button>
            ))}
          </div>
          {presetEnd && (
            <p className="text-sm text-muted-foreground">
              Kết thúc thuê: {datePart(presetEnd)} {hourPart(presetEnd)}:00
            </p>
          )}
        </div>
      )}

      {totalHours > 0 && (
        <p className="text-xs text-muted-foreground">
          Tổng thời gian: {totalHours} giờ ≈ {dayCount} ngày (1 ngày = 24 tiếng kể từ lúc nhận, trễ
          quá 2 tiếng mới tính sang ngày kế tiếp).
        </p>
      )}

      {/* ISO UTC ("Z") tường minh — timestamptz sẽ hiểu sai giờ theo timezone
          phiên DB (UTC) nếu gửi chuỗi giờ địa phương không có offset. */}
      <input type="hidden" name="rental_start_at" value={startAtDate.toISOString()} />
      <input
        type="hidden"
        name="rental_end_at"
        value={(endAtDate ?? combineDateHour(effectiveEndDate, effectiveEndHour)).toISOString()}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu thời gian thuê"}
      </Button>
    </form>
  );
}
