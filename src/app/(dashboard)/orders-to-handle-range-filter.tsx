"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_RANGE_PRESET_OPTIONS } from "@/lib/date-range-presets";

// Chỉ các mốc hướng tới tương lai, khớp đúng bộ nút của Booqable (Today/
// Tomorrow/Next 7 days/Next week/Next month) — "Đơn hàng sắp tới"/"sắp về"
// là danh sách việc sắp xảy ra, các preset quá khứ (hôm qua, tuần trước...)
// không hợp lý ở đây (khác với bộ lọc /orders dùng đủ preset).
const UPCOMING_RANGE_VALUES = [
  "all",
  "today",
  "tomorrow",
  "next_7_days",
  "next_week",
  "next_month",
];
const UPCOMING_RANGE_OPTIONS = DATE_RANGE_PRESET_OPTIONS.filter((o) =>
  UPCOMING_RANGE_VALUES.includes(o.value),
);

export function OrdersToHandleRangeFilter({
  paramName,
  value,
}: {
  paramName: string;
  value: string;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === "all") {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={value} onValueChange={(v) => handleChange(v ?? "all")}>
      <SelectTrigger className="h-7 w-32 text-xs">
        <SelectValue placeholder="Tất cả">
          {(v: string) => UPCOMING_RANGE_OPTIONS.find((o) => o.value === v)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {UPCOMING_RANGE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
