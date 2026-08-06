"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const CONFIG = {
  individual: { label: "Khách cá nhân", color: "var(--chart-2)" },
  company: { label: "Khách công ty", color: "var(--chart-1)" },
} satisfies ChartConfig;

// So sánh số khách hoạt động/số đơn giữa Cá nhân và Công ty — cùng đơn vị
// "lượt đếm" nên gộp chung 1 trục được (khác doanh thu, để riêng ở donut
// tỉ trọng). CEO yêu cầu 2026-08-06 thêm biểu đồ cho bảng tương quan.
export function CustomerTypeMetricsBarChart({
  individualCustomerCount,
  companyCustomerCount,
  individualOrderCount,
  companyOrderCount,
}: {
  individualCustomerCount: number;
  companyCustomerCount: number;
  individualOrderCount: number;
  companyOrderCount: number;
}) {
  const rows = [
    { metric: "Số khách hoạt động", individual: individualCustomerCount, company: companyCustomerCount },
    { metric: "Số đơn hàng", individual: individualOrderCount, company: companyOrderCount },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Số khách &amp; số đơn</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CONFIG} className="aspect-auto h-[220px] w-full">
          <BarChart data={rows} margin={{ left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="metric" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => numberFormatter.format(v)} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {name === "individual" ? CONFIG.individual.label : CONFIG.company.label}
                      </span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {numberFormatter.format(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="individual" fill="var(--color-individual)" radius={4} />
            <Bar dataKey="company" fill="var(--color-company)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
