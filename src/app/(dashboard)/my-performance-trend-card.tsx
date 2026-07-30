"use client";

import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MyMonthlyTrendPoint } from "@/lib/employee-performance-charts";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Cùng nhãn + màu với biểu đồ cơ cấu thu nhập bên quản lý (employee-
// performance-charts.tsx) để nhân viên và quản lý nhìn cùng một "ngôn ngữ".
const CONFIG = {
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

const STACK_KEYS = Object.keys(CONFIG) as (keyof typeof CONFIG)[];

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `T${Number(m)}/${year.slice(2)}`;
}

// Cơ cấu thu nhập của chính nhân viên qua các tháng, vẽ dạng area chart
// chồng (gradient mềm) + đường tổng thu nhập nổi bật đè lên trên — thấy rõ
// từng hạng mục tăng giảm ra sao và xu hướng tổng thể để biết mà phấn đấu.
export function MyPerformanceTrendCard({ points }: { points: MyMonthlyTrendPoint[] }) {
  const completed = points.filter((p) => !p.inProgress);
  const last = completed[completed.length - 1];
  const prev = completed[completed.length - 2];
  const delta =
    last && prev && prev.totalIncome > 0
      ? ((last.totalIncome - prev.totalIncome) / prev.totalIncome) * 100
      : null;

  const data = points.map((p) => ({
    ...p,
    label: p.inProgress ? `${monthLabel(p.month)}*` : monthLabel(p.month),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thu nhập của bạn qua các tháng</CardTitle>
        {delta !== null && last && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            {delta >= 0 ? (
              <TrendingUp className="size-4 text-green-600" />
            ) : (
              <TrendingDown className="size-4 text-destructive" />
            )}
            Tháng {monthLabel(last.month)} {delta >= 0 ? "tăng" : "giảm"}{" "}
            {Math.abs(delta).toFixed(1)}% so với tháng trước
            {delta >= 0 ? " — giữ vững phong độ nhé!" : " — tháng này bứt phá lại nào!"}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer config={CONFIG} className="aspect-auto h-80 w-full">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
            <defs>
              {STACK_KEYS.map((key) => (
                <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.85} />
                  <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.12} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              tickFormatter={(v) => currencyFormatter.format(v)}
              width={80}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item, index) => (
                    <>
                      <div
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.color }}
                      />
                      {CONFIG[name as keyof typeof CONFIG]?.label ?? name}
                      <div className="ml-auto font-mono font-medium tabular-nums text-foreground">
                        {currencyFormatter.format(Number(value))}đ
                      </div>
                      {index === STACK_KEYS.length - 1 && (
                        <div className="mt-1.5 flex basis-full items-center border-t pt-1.5 text-xs font-medium text-foreground">
                          Tổng thu nhập
                          <div className="ml-auto font-mono tabular-nums">
                            {currencyFormatter.format(item.payload.totalIncome)}đ
                          </div>
                        </div>
                      )}
                    </>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {STACK_KEYS.map((key) => (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                stackId="income"
                stroke={`var(--color-${key})`}
                strokeWidth={1.5}
                fill={`url(#fill-${key})`}
              />
            ))}
            <Line
              dataKey="totalIncome"
              type="monotone"
              stroke="var(--foreground)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 3, strokeWidth: 0, fill: "var(--foreground)" }}
              legendType="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          Đường nét đứt là tổng thu nhập. * Tháng hiện tại chưa chốt sổ. Di chuột lên biểu đồ để xem
          chi tiết từng hạng mục.
        </p>
      </CardContent>
    </Card>
  );
}
