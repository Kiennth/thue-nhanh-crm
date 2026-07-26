"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EquipmentValueTrendPoint } from "@/lib/equipment-value-overview";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

type Granularity = "week" | "month" | "year";
type Metric = "value" | "quantity";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  week: "Theo tuần",
  month: "Theo tháng",
  year: "Theo năm",
};

const METRIC_LABELS: Record<Metric, string> = {
  value: "Giá trị tồn kho",
  quantity: "Số lượng hàng hoá",
};

function toChartRows(points: EquipmentValueTrendPoint[], metric: Metric) {
  return points.map((p) => ({
    label: p.label,
    current: metric === "value" ? p.value : p.quantity,
    previousYear: metric === "value" ? p.previousYearValue : p.previousYearQuantity,
  }));
}

export function EquipmentValueTrendChart({
  trend,
}: {
  trend: { week: EquipmentValueTrendPoint[]; month: EquipmentValueTrendPoint[]; year: EquipmentValueTrendPoint[] };
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [metric, setMetric] = useState<Metric>("value");

  const rows = toChartRows(trend[granularity], metric);
  const showPreviousYear = granularity !== "year";
  const config = {
    current: { label: METRIC_LABELS[metric], color: "var(--chart-1)" },
    previousYear: { label: "Cùng kỳ năm trước", color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Giá trị thiết bị theo thời gian</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={granularity === g ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => setGranularity(g)}
              >
                {GRANULARITY_LABELS[g]}
              </Button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={metric === m ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => setMetric(m)}
              >
                {METRIC_LABELS[m]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
          <LineChart data={rows} margin={{ left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (metric === "value" ? currencyFormatter.format(v) : v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const label = name === "previousYear" ? "Cùng kỳ năm trước" : METRIC_LABELS[metric];
                    const formatted =
                      metric === "value" ? `${currencyFormatter.format(Number(value))}đ` : String(value);
                    return (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatted}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="current"
              type="monotone"
              stroke="var(--color-current)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            {showPreviousYear && (
              <Line
                dataKey="previousYear"
                type="monotone"
                stroke="var(--color-previousYear)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
