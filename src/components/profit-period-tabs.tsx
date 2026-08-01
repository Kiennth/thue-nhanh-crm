"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";
import { PROFIT_PERIOD_OPTIONS, type ProfitPeriod } from "@/lib/profit-period";

// Khác cụm nút của card Doanh thu (đổi state client, dữ liệu đã có sẵn):
// lợi nhuận cần server TÍNH LẠI chi phí + quỹ lương theo kỳ (kỳ năm là cộng
// tới 12 tháng lương), nên nút ở đây đẩy lựa chọn lên URL cho server render.
export function ProfitPeriodTabs({ value }: { value: ProfitPeriod }) {
  const router = useRouter();
  const { start } = useTopLoader();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: ProfitPeriod) {
    if (next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("profitPeriod", next);
    start();
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-lg bg-muted p-1">
      {PROFIT_PERIOD_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => select(o.value)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            value === o.value
              ? "bg-background font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
