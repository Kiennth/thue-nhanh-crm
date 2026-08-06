"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";

export type CustomerOverviewPeriod = "thisMonth" | "lastMonth" | "thisYear" | "lastYear";

const OPTIONS: { value: CustomerOverviewPeriod; label: string }[] = [
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
  { value: "thisYear", label: "Năm nay" },
  { value: "lastYear", label: "Năm trước" },
];

// Mirror OrdersOverviewPeriodToggle (src/app/(dashboard)/orders/orders-overview-period-toggle.tsx)
// — CEO yêu cầu 2026-08-06 khối "Báo cáo khách hàng" cũng có toggle kỳ
// giống hệt UX bên /orders. Khoá kỳ đặt camelCase (thisMonth/...) vì đây
// chính là tên key trong jsonb "periodStats" trả về từ RPC
// customer_page_report (20260806160000), không cần lớp map trung gian.
export function CustomerOverviewPeriodToggle({ value }: { value: CustomerOverviewPeriod }) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: CustomerOverviewPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "thisMonth") {
      params.delete("overview");
    } else {
      params.set("overview", next);
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
