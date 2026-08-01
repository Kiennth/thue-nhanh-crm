"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EmployeeMonthlyPerformance } from "@/lib/employee-performance-charts";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function rowHeight(count: number) {
  return Math.max(220, count * 44);
}

const INCOME_COMPOSITION_CONFIG = {
  baseSalary: { label: "Lương cứng", color: "var(--chart-1)" },
  totalCommission: { label: "Khoán", color: "var(--chart-2)" },
  installationPayout: { label: "Lắp đặt", color: "var(--chart-3)" },
  removalPayout: { label: "Tháo dỡ", color: "var(--chart-6)" },
  supportPayout: { label: "Support", color: "var(--chart-7)" },
  deliveryPayout: { label: "Giao hàng", color: "var(--chart-8)" },
  collectionPayout: { label: "Thu hồi", color: "var(--chart-9)" },
  overtimePay: { label: "OT", color: "var(--chart-5)" },
  bonus: { label: "Thưởng", color: "var(--chart-4)" },
} satisfies ChartConfig;

// Dùng ở trang Bảng lương — biểu đồ hiệu suất riêng ở Trang chủ đã bỏ (CEO
// chốt 2026-08-01: số liệu đủ đầy ở Bảng lương rồi, không cần lặp lại).
export function EmployeeIncomeCompositionChart({ rows }: { rows: EmployeeMonthlyPerformance[] }) {
  return (
    <ChartContainer
      config={INCOME_COMPOSITION_CONFIG}
      className="aspect-auto w-full"
      style={{ height: rowHeight(rows.length) }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => `${currencyFormatter.format(Number(value))}đ`} />}
        />
        {/* flex-wrap: 9 hạng mục không đủ chỗ 1 hàng ở màn hẹp, không wrap
            thì nhãn bị cắt mất chữ. */}
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-3 gap-y-1" />} />
        <Bar dataKey="baseSalary" stackId="income" fill="var(--color-baseSalary)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="totalCommission" stackId="income" fill="var(--color-totalCommission)" />
        <Bar dataKey="installationPayout" stackId="income" fill="var(--color-installationPayout)" />
        <Bar dataKey="removalPayout" stackId="income" fill="var(--color-removalPayout)" />
        <Bar dataKey="supportPayout" stackId="income" fill="var(--color-supportPayout)" />
        <Bar dataKey="deliveryPayout" stackId="income" fill="var(--color-deliveryPayout)" />
        <Bar dataKey="collectionPayout" stackId="income" fill="var(--color-collectionPayout)" />
        <Bar dataKey="overtimePay" stackId="income" fill="var(--color-overtimePay)" />
        <Bar dataKey="bonus" stackId="income" fill="var(--color-bonus)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
