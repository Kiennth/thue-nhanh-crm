"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const CONFIG = {
  processing: { label: "Đang xử lý", color: "var(--chart-2)" },
  completed: { label: "Hoàn tất", color: "var(--chart-1)" },
  cancelled: { label: "Đã huỷ", color: "var(--destructive)" },
} satisfies ChartConfig;

// Donut cơ cấu trạng thái đơn (đúng kỳ đang chọn ở khối "Tổng quan đơn
// hàng") — CEO yêu cầu 2026-08-06 thêm biểu đồ cho trực quan hơn, thay vì
// chỉ 3 con số rời rạc ở 3 thẻ.
export function OrdersStatusDonutChart({
  processingCount,
  completedCount,
  cancelledCount,
}: {
  processingCount: number;
  completedCount: number;
  cancelledCount: number;
}) {
  const total = processingCount + completedCount + cancelledCount;
  const slices = [
    { key: "processing", name: CONFIG.processing.label, value: processingCount, color: CONFIG.processing.color },
    { key: "completed", name: CONFIG.completed.label, value: completedCount, color: CONFIG.completed.color },
    { key: "cancelled", name: CONFIG.cancelled.label, value: cancelledCount, color: CONFIG.cancelled.color },
  ].filter((s) => s.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cơ cấu trạng thái đơn</CardTitle>
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
                          {Number(value)} đơn (
                          {total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={slices.length ? slices : [{ key: "empty", name: "Chưa có đơn", value: 1, color: "var(--muted)" }]}
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
            <span className="text-xs text-muted-foreground">Tổng</span>
            <span className="text-xl font-semibold tabular-nums">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
