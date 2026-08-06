"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";

export type PayrollBranchScope = "thisMonth" | "lastMonth" | "thisYear" | "lastYear";

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
export function PayrollBranchPeriodToggle({ value }: { value: PayrollBranchScope }) {
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
    const query = params.toString();
    start();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border p-1">
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
    </div>
  );
}
