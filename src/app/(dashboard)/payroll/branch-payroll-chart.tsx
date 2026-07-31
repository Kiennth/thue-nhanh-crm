"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// 1 chuỗi số liệu duy nhất (quỹ lương) nên không cần chú giải — tiêu đề thẻ
// đã nói rõ đang đo gì; giá trị dán thẳng lên đầu thanh thay vì bắt dò trục.
const CONFIG = {
  total: { label: "Quỹ lương", color: "var(--chart-1)" },
} satisfies ChartConfig;

export interface BranchPayrollPoint {
  branch: string;
  total: number;
  headcount: number;
}

export function BranchPayrollChart({ points }: { points: BranchPayrollPoint[] }) {
  return (
    <ChartContainer
      config={CONFIG}
      className="aspect-auto w-full"
      style={{ height: Math.max(180, points.length * 52) }}
    >
      <BarChart data={points} layout="vertical" margin={{ left: 8, right: 72 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="branch" width={90} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex flex-1 items-center justify-between gap-3">
                  <span>Quỹ lương</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {currencyFormatter.format(Number(value))}đ · {item.payload.headcount} người
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="total"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => `${currencyFormatter.format(Number(v ?? 0))}đ`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
