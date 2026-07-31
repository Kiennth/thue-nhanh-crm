"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReturningRatePoint } from "@/lib/customer-reports";

// Một chuỗi duy nhất → không cần chú giải. Đây là tỉ lệ biến động theo thời
// gian nên dùng đường, không dùng cột.
const CONFIG = {
  rate: { label: "Tỉ lệ khách cũ", color: "var(--chart-2)" },
} satisfies ChartConfig;

function shortMonth(month: string) {
  const [year, m] = month.split("-");
  return `Th${Number(m)}/${year.slice(2)}`;
}

export function ReturningRateChart({ points }: { points: ReturningRatePoint[] }) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-[220px] w-full">
      <LineChart data={points} margin={{ top: 12, left: 4, right: 12 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[0, 100]}
          width={36}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) =>
                `Tháng ${String(label).split("-")[1]}/${String(label).split("-")[0]}`
              }
              formatter={(value, _name, item) => (
                <div className="flex flex-1 items-center justify-between gap-3">
                  <span>Khách cũ</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {Number(value).toFixed(0)}% · {item.payload.returningCount}/
                    {item.payload.activeCount} khách
                  </span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="rate"
          type="monotone"
          stroke="var(--color-rate)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}
