"use client";

import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PeriodPicker } from "@/components/period-picker";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export interface BranchPeriodRow {
  branchId: string;
  branchName: string;
  // Màu bám theo CHI NHÁNH (thứ tự tên cố định), không theo thứ hạng doanh
  // thu — đổi kỳ xem thì Hà Nội vẫn giữ nguyên màu của Hà Nội.
  colorIndex: number;
  day: number;
  // Tuần (Thứ 2 → CN) chứa ngày đang chọn.
  week: number;
  month: number;
  // Tháng liền trước tháng đang chọn.
  prevMonth: number;
  year: number;
  // Trọn năm liền trước năm đang chọn — để đối chiếu nhanh với năm nay.
  prevYear: number;
}

type PeriodKey = "day" | "week" | "month" | "prevMonth" | "year" | "prevYear";

export function BranchComparisonCard({
  rows,
  day,
  month,
  year,
}: {
  rows: BranchPeriodRow[];
  day: string;
  month: string;
  year: string;
}) {
  // CEO chốt 2026-08-01: mặc định xem theo tháng — nhịp điều hành chính;
  // "Hôm nay" đầu ngày thường 0đ chưa nói lên gì.
  const [period, setPeriod] = useState<PeriodKey>("month");

  // Thứ tự từ hẹp tới rộng, kỳ hiện tại đứng trước kỳ đối chiếu của nó:
  // Ngày → Tuần → Tháng → Tháng trước → Năm → Năm trước.
  const periodTabs: { key: PeriodKey; label: string }[] = [
    { key: "day", label: "Hôm nay" },
    { key: "week", label: "Tuần này" },
    { key: "month", label: "Tháng này" },
    { key: "prevMonth", label: "Tháng trước" },
    { key: "year", label: "Năm nay" },
    { key: "prevYear", label: "Năm trước" },
  ];

  // Tiêu đề ngắn gọn (CEO chốt) — kỳ đang xem đã hiện rõ trên nút chuyển và
  // ô chọn ngày/tháng/năm ngay cạnh, không cần nhắc lại trong tên card.
  const periodTitle = period === "year" ? "Tổng quan" : "Doanh thu";

  const sorted = [...rows].sort((a, b) => b[period] - a[period]);
  const total = rows.reduce((sum, r) => sum + r[period], 0);
  // Lát 0đ bỏ khỏi vòng cho sạch — bảng bên cạnh vẫn liệt kê đủ chi nhánh.
  const slices = sorted.filter((r) => r[period] > 0);

  const chartConfig = Object.fromEntries(
    rows.map((r) => [r.branchName, { label: r.branchName }]),
  ) satisfies ChartConfig;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{periodTitle}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1">
            {periodTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPeriod(tab.key)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  period === tab.key
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Tuần đi theo ngày đang chọn — chọn ngày nào là xem tuần đó.
              Tháng trước / Năm trước đi theo ô chọn tháng / năm (trừ 1). */}
          {(period === "day" || period === "week") && (
            <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />
          )}
          {(period === "month" || period === "prevMonth") && (
            <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          )}
          {(period === "year" || period === "prevYear") && (
            <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center">
          <div className="relative">
            {/* Hộp rộng hơn vòng để nhãn tên chi nhánh đứng ngoài lát không
                bị cắt chữ. */}
            <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-[400px] max-w-full">
              <PieChart>
                {/* Số tuyệt đối + (%) nằm ngay trong donut qua tooltip khi rê
                    chuột — CEO chốt bỏ cột số ở chú giải, ví dụ mẫu:
                    "Hà Nội 2.436.257.018đ (41%)". */}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-medium tabular-nums">
                            {currencyFormatter.format(Number(value))}đ (
                            {total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {/* Kỳ 0đ vẫn vẽ 1 vòng xám mờ — mất hẳn vòng thì chữ "Tổng
                    0đ" lơ lửng như lỗi hiển thị. */}
                <Pie
                  data={
                    slices.length
                      ? slices.map((r) => ({ name: r.branchName, value: r[period] }))
                      : [{ name: "Chưa có doanh thu", value: 1 }]
                  }
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  strokeWidth={0}
                  isAnimationActive={slices.length > 0}
                  // Tên chi nhánh dán thẳng cạnh lát (CEO bỏ chú giải ngoài);
                  // lát dưới 4% không đủ chỗ — tooltip lo phần đó.
                  label={({ name, percent }) =>
                    slices.length && (percent ?? 0) >= 0.04 ? String(name) : ""
                  }
                >
                  {slices.length ? (
                    slices.map((r) => (
                      <Cell key={r.branchId} fill={`var(--chart-${r.colorIndex + 1})`} />
                    ))
                  ) : (
                    <Cell fill="var(--muted)" />
                  )}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted-foreground">Tổng</span>
              <span className="max-w-[110px] text-base font-semibold tabular-nums leading-tight">
                {currencyFormatter.format(total)}đ
              </span>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
