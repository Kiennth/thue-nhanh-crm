"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { Button } from "@/components/ui/button";

export type OrdersOverviewPeriod = "this_month" | "last_month" | "this_year" | "last_year";

const OPTIONS: { value: OrdersOverviewPeriod; label: string }[] = [
  { value: "this_month", label: "Tháng này" },
  { value: "last_month", label: "Tháng trước" },
  { value: "this_year", label: "Năm nay" },
  { value: "last_year", label: "Năm trước" },
];

// Kỳ cho khối "Tổng quan đơn hàng" — TÁCH RIÊNG khỏi bộ lọc khoảng ngày của
// bảng danh sách bên dưới (OrderDateRangeFilter): mặc định bảng vẫn xem
// "Tất cả thời gian" để tra cứu, còn khối tổng quan cần số CÓ Ý NGHĨA
// (tháng này/tháng trước/năm nay/năm trước) chứ không phải tổng dồn suốt
// lịch sử — CEO yêu cầu 2026-08-06.
export function OrdersOverviewPeriodToggle({ value }: { value: OrdersOverviewPeriod }) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: OrdersOverviewPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "this_month") {
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
