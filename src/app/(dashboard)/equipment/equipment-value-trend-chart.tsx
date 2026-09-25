"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartSpline } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccentTitle, accentCard, accentColor, accentHeader } from "@/components/section-accent";
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
    // Tím cho kỳ hiện tại, cam cho cùng kỳ năm trước — 2 sắc tương phản rõ,
    // đọc được trên cả nền sáng lẫn tối (CEO 2026-09-25: chart vui mắt hơn).
    current: { label: METRIC_LABELS[metric], color: accentColor("violet") },
    previousYear: { label: "Cùng kỳ năm trước", color: accentColor("orange") },
  } satisfies ChartConfig;

  return (
    <Card className={accentCard("violet")}>
      <CardHeader className={accentHeader("violet", "flex flex-wrap items-center justify-between gap-2")}>
        <CardTitle className="text-base">
          <AccentTitle accent="violet" icon={ChartSpline}>Giá trị thiết bị theo thời gian</AccentTitle>
        </CardTitle>
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
          <AreaChart data={rows} margin={{ left: 8 }}>
            <defs>
              <linearGradient id="fillEquipmentCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-current)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-current)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={metric === "value" ? 96 : 48}
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
            {showPreviousYear && (
              <Area
                dataKey="previousYear"
                type="monotone"
                stroke="var(--color-previousYear)"
                fill="none"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            )}
            <Area
              dataKey="current"
              type="monotone"
              stroke="var(--color-current)"
              fill="url(#fillEquipmentCurrent)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--color-current)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--color-current)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
