"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateOrderRentalPeriod } from "@/lib/actions/orders";

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

interface RentalPeriodFormProps {
  orderId: string;
  rentalStartAt: string | null;
  rentalEndAt: string | null;
}

export function RentalPeriodForm({ orderId, rentalStartAt, rentalEndAt }: RentalPeriodFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Mặc định khi chưa đặt: bắt đầu = thời điểm hiện tại, kết thúc = +24h
  // ("1 ngày thuê" mặc định).
  const [startDate, setStartDate] = useState(() =>
    datePart(rentalStartAt ? new Date(rentalStartAt) : new Date()),
  );
  const [startHour, setStartHour] = useState(() =>
    hourPart(rentalStartAt ? new Date(rentalStartAt) : new Date()),
  );
  const [endDate, setEndDate] = useState(() =>
    datePart(rentalEndAt ? new Date(rentalEndAt) : new Date(Date.now() + 24 * 3_600_000)),
  );
  const [endHour, setEndHour] = useState(() =>
    hourPart(rentalEndAt ? new Date(rentalEndAt) : new Date(Date.now() + 24 * 3_600_000)),
  );

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
        Áp dụng chung cho mọi thiết bị cho thuê trong đơn — bắt đầu và kết thúc cùng nhau.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rental_start_date">Bắt đầu thuê</Label>
          <div className="flex gap-2">
            <Input
              id="rental_start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Select value={startHour} onValueChange={(value) => setStartHour(value ?? startHour)}>
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
        <div className="space-y-2">
          <Label htmlFor="rental_end_date">Kết thúc thuê</Label>
          <div className="flex gap-2">
            <Input
              id="rental_end_date"
              type="date"
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
      </div>
      <input type="hidden" name="rental_start_at" value={`${startDate}T${startHour}:00:00`} />
      <input type="hidden" name="rental_end_at" value={`${endDate}T${endHour}:00:00`} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu thời gian thuê"}
      </Button>
    </form>
  );
}
