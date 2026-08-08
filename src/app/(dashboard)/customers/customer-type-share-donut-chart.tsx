"use client";

import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
export interface CustomerTypeStat {
  customerCount: number;
  orderCount: number;
  revenue: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const CONFIG = {
  individual: { label: "Khách cá nhân", color: "var(--chart-2)" },
  company: { label: "Khách công ty", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Metric = "revenue" | "customerCount" | "orderCount";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "revenue", label: "Doanh thu" },
  { value: "customerCount", label: "Số khách" },
  { value: "orderCount", label: "Số đơn" },
];

// Gộp 2 biểu đồ cũ (donut doanh thu + bar số khách/đơn) làm 1 — cả 3 chỉ
// số (doanh thu/số khách/số đơn) đều tự nhiên cộng lại đúng 100% giữa Cá
// nhân/Công ty nên chỉ cần 1 donut + toggle đổi chỉ số, không cần 2 dạng
// biểu đồ khác nhau. CEO yêu cầu 2026-08-06.
export function CustomerTypeShareDonutChart({
  individual,
  company,
}: {
  individual: CustomerTypeStat;
  company: CustomerTypeStat;
}) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const isRevenue = metric === "revenue";
  const formatValue = (v: number) => (isRevenue ? `${currencyFormatter.format(v)}đ` : numberFormatter.format(v));

  const individualValue = individual[metric];
  const companyValue = company[metric];
  const total = individualValue + companyValue;
  const slices = [
    { key: "individual", name: CONFIG.individual.label, value: individualValue, color: CONFIG.individual.color },
    { key: "company", name: CONFIG.company.label, value: companyValue, color: CONFIG.company.color },
  ].filter((s) => s.value > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">
          Tỉ trọng {METRIC_OPTIONS.find((o) => o.value === metric)!.label.toLowerCase()}
        </CardTitle>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1">
          {METRIC_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={metric === o.value ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setMetric(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
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
                          {formatValue(Number(value))} (
                          {total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={slices.length ? slices : [{ key: "empty", name: "Chưa có dữ liệu", value: 1, color: "var(--muted)" }]}
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
            <span className="text-xs text-muted-foreground">Tổng {METRIC_OPTIONS.find((o) => o.value === metric)!.label.toLowerCase()}</span>
            <span className="max-w-[130px] text-base font-semibold tabular-nums leading-tight">
              {formatValue(total)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
