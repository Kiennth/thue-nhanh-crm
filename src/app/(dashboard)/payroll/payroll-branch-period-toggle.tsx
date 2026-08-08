"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PayrollBranchScope = "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "custom";

const OPTIONS: { value: PayrollBranchScope; label: string }[] = [
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
  { value: "thisYear", label: "Năm nay" },
  { value: "lastYear", label: "Năm trước" },
];

// "Tháng này"/"Tháng trước" ở đây là THÁNG ĐANG CHỌN trên MonthNavigator của
// cả trang (param `month`) và tháng liền trước nó — KHÔNG phải tháng thực tế
// hôm nay, để khớp với mọi số liệu khác trên trang khi đã lùi lịch xem tháng
// cũ. "Năm nay"/"Năm trước" = năm chứa tháng đang chọn. CEO yêu cầu 2026-08-06.
//
// "custom" (ô chọn tháng cuối cùng, CEO yêu cầu 2026-08-06): xem 1 tháng bất
// kỳ cho RIÊNG 2 khối này, tách biệt với MonthNavigator của cả trang — khác
// PeriodPicker/MonthNavigator vốn đổi luôn tháng của toàn trang (4 thẻ tổng
// quan). VD: đang xem thẻ tổng quan tháng 8 nhưng muốn ngó lại cơ cấu thu
// nhập tháng 3 mà không phải rời khỏi tháng 8.
export function PayrollBranchPeriodToggle({
  value,
  customMonth,
}: {
  value: PayrollBranchScope;
  customMonth: string;
}) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: PayrollBranchScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "thisMonth") {
      params.delete("payrollScope");
    } else {
      params.set("payrollScope", next);
    }
    if (next !== "custom") {
      params.delete("payrollCustomMonth");
    }
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleCustomMonthChange(next: string) {
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("payrollScope", "custom");
    params.set("payrollCustomMonth", next);
    start();
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "ghost"}
          className="h-7 px-2.5 text-xs"
          onClick={() => handleChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
      <Input
        key={customMonth}
        type="month"
        aria-label="Chọn tháng bất kỳ"
        defaultValue={customMonth}
        className={`h-7 w-32 text-xs ${value === "custom" ? "border-primary" : ""}`}
        onChange={(e) => handleCustomMonthChange(e.target.value)}
      />
    </div>
  );
}
