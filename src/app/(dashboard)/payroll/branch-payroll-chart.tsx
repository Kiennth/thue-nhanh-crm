"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export interface BranchPayrollPoint {
  branchId: string;
  branch: string;
  total: number;
  headcount: number;
  // Màu bám theo CHI NHÁNH (thứ tự cố định trong bảng chi tiết), không theo
  // thứ hạng quỹ lương — đổi kỳ xem thì mỗi chi nhánh vẫn giữ nguyên màu.
  colorIndex: number;
}

// Đổi từ bar chart sang donut (CEO yêu cầu 2026-08-06) — cùng khuôn mẫu với
// BranchComparisonCard (so sánh doanh thu chi nhánh ở trang chủ): số tuyệt
// đối + % qua tooltip, tên chi nhánh dán cạnh lát đủ lớn, tổng ở giữa vòng.
export function BranchPayrollDonutChart({ points }: { points: BranchPayrollPoint[] }) {
  const total = points.reduce((sum, p) => sum + p.total, 0);
  const slices = points.filter((p) => p.total > 0);

  const chartConfig = Object.fromEntries(
    points.map((p) => [p.branch, { label: p.branch }]),
  ) satisfies ChartConfig;

  return (
    <div className="flex justify-center">
      <div className="relative">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-[400px] max-w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name, item) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-medium tabular-nums">
                        {currencyFormatter.format(Number(value))}đ (
                        {total > 0 ? Math.round((Number(value) / total) * 100) : 0}%) ·{" "}
                        {item.payload.headcount} người
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={
                slices.length
                  ? slices.map((p) => ({ name: p.branch, value: p.total, headcount: p.headcount }))
                  : [{ name: "Chưa có dữ liệu", value: 1, headcount: 0 }]
              }
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={slices.length > 1 ? 2 : 0}
              strokeWidth={0}
              isAnimationActive={slices.length > 0}
              label={({ name, percent }) =>
                slices.length && (percent ?? 0) >= 0.04 ? String(name) : ""
              }
            >
              {slices.length ? (
                slices.map((p) => <Cell key={p.branchId} fill={`var(--chart-${(p.colorIndex % 10) + 1})`} />)
              ) : (
                <Cell fill="var(--muted)" />
              )}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Tổng quỹ lương</span>
          <span className="max-w-[110px] text-base font-semibold tabular-nums leading-tight">
            {currencyFormatter.format(total)}đ
          </span>
        </div>
      </div>
    </div>
  );
}
