"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/period-picker";

function shiftMonth(month: string, delta: number) {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Mũi tên lùi/tới tháng — ô <input type="month"> gốc quá nhỏ, đặt góc phải,
// dễ bị bỏ sót là có thể bấm được để xem tháng trước.
export function MonthNavigator({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToMonth(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goToMonth(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
        <span className="sr-only">Tháng trước</span>
      </Button>
      <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goToMonth(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
        <span className="sr-only">Tháng sau</span>
      </Button>
    </div>
  );
}
