"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { TrendPoint } from "@/lib/orders-overview";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

type Granularity = "week" | "month" | "year";
type Metric = "count" | "revenue";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  week: "Theo tuần",
  month: "Theo tháng",
  year: "Theo năm",
};

const METRIC_LABELS: Record<Metric, string> = {
  revenue: "Doanh thu",
  count: "Số đơn hàng",
};

function toChartRows(points: TrendPoint[], metric: Metric) {
  return points.map((p) => {
    const actual = metric === "count" ? p.count : p.revenue;
    const projectedTotal = metric === "count" ? p.projectedCount : p.projectedRevenue;
    return {
      label: p.label,
      actual,
      projected: p.isCurrent && projectedTotal !== undefined ? Math.max(0, projectedTotal - actual) : 0,
    };
  });
}

export function OrdersTrendChart({
  trend,
}: {
  trend: { week: TrendPoint[]; month: TrendPoint[]; year: TrendPoint[] };
}) {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [metric, setMetric] = useState<Metric>("revenue");

  const rows = toChartRows(trend[granularity], metric);
  const config = {
    actual: { label: METRIC_LABELS[metric], color: "var(--chart-1)" },
    projected: { label: "Dự kiến thêm", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Xu hướng đơn hàng</CardTitle>
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
          <BarChart data={rows} margin={{ left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (metric === "revenue" ? currencyFormatter.format(v) : v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    const isProjected = name === "projected";
                    const label = isProjected ? "Dự kiến thêm" : METRIC_LABELS[metric];
                    const formatted =
                      metric === "revenue"
                        ? `${currencyFormatter.format(Number(value))}đ`
                        : String(value);
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
            <Bar dataKey="actual" stackId="trend" fill="var(--color-actual)" />
            <Bar dataKey="projected" stackId="trend" fill="var(--color-projected)" fillOpacity={0.35} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
