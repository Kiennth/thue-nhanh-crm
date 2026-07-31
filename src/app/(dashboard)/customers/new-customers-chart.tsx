"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { NewCustomerPoint } from "@/lib/customer-reports";

// Một chuỗi số liệu duy nhất nên không cần chú giải — tiêu đề thẻ đã nói rõ
// đang đếm gì; số dán thẳng lên đầu cột thay vì bắt dò trục.
const CONFIG = {
  count: { label: "Khách mới", color: "var(--chart-1)" },
} satisfies ChartConfig;

// "2026-07" → "Th7/26" cho nhãn trục, đủ ngắn để 12 cột không chồng chữ.
function shortMonth(month: string) {
  const [year, m] = month.split("-");
  return `Th${Number(m)}/${year.slice(2)}`;
}

export function NewCustomersChart({ points }: { points: NewCustomerPoint[] }) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-[220px] w-full">
      <BarChart data={points} margin={{ top: 20, left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Tháng ${String(label).split("-")[1]}/${String(label).split("-")[0]}`}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]}>
          <LabelList
            dataKey="count"
            position="top"
            className="fill-muted-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
