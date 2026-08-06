"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const CONFIG = {
  individual: { label: "Khách cá nhân", color: "var(--chart-2)" },
  company: { label: "Khách công ty", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Donut tỉ trọng doanh thu Cá nhân/Công ty — CEO yêu cầu 2026-08-06 thêm
// biểu đồ cho bảng tương quan "đẹp, trực quan hơn". Mirror đúng pattern đã
// dùng ở branch-comparison-card.tsx / orders-status-donut-chart.tsx.
export function CustomerTypeRevenueDonutChart({
  individualRevenue,
  companyRevenue,
}: {
  individualRevenue: number;
  companyRevenue: number;
}) {
  const total = individualRevenue + companyRevenue;
  const slices = [
    { key: "individual", name: CONFIG.individual.label, value: individualRevenue, color: CONFIG.individual.color },
    { key: "company", name: CONFIG.company.label, value: companyRevenue, color: CONFIG.company.color },
  ].filter((s) => s.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tỉ trọng doanh thu</CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center">
        <div className="relative">
          <ChartContainer config={CONFIG} className="aspect-auto h-[220px] w-[320px] max-w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-medium tabular-nums">
                          {currencyFormatter.format(Number(value))}đ (
                          {total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={slices.length ? slices : [{ key: "empty", name: "Chưa có doanh thu", value: 1, color: "var(--muted)" }]}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={slices.length > 1 ? 2 : 0}
                strokeWidth={0}
                isAnimationActive={slices.length > 0}
                label={({ percent }) => (slices.length && (percent ?? 0) >= 0.08 ? `${Math.round((percent ?? 0) * 100)}%` : "")}
              >
                {(slices.length ? slices : [{ key: "empty", color: "var(--muted)" }]).map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-muted-foreground">Tổng doanh thu</span>
            <span className="max-w-[110px] text-base font-semibold tabular-nums leading-tight">
              {currencyFormatter.format(total)}đ
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
