"use client";

import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PeriodPicker } from "@/components/period-picker";
import { BranchBadge } from "@/components/branch-badge";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export interface BranchPeriodRow {
  branchId: string;
  branchName: string;
  // Màu bám theo CHI NHÁNH (thứ tự tên cố định), không theo thứ hạng doanh
  // thu — đổi kỳ xem thì Hà Nội vẫn giữ nguyên màu của Hà Nội.
  colorIndex: number;
  day: number;
  month: number;
  year: number;
}

type PeriodKey = "day" | "month" | "year";

// "2026-08-01" → "1/8/2026" cho tiêu đề khi xem một ngày khác hôm nay.
function formatDayLabel(day: string) {
  const [y, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

export function BranchComparisonCard({
  rows,
  day,
  month,
  year,
  isToday,
  isThisMonth,
  isThisYear,
}: {
  rows: BranchPeriodRow[];
  day: string;
  month: string;
  year: string;
  isToday: boolean;
  isThisMonth: boolean;
  isThisYear: boolean;
}) {
  // CEO chốt 2026-08-01: mặc định xem theo tháng — nhịp điều hành chính;
  // "Hôm nay" đầu ngày thường 0đ chưa nói lên gì.
  const [period, setPeriod] = useState<PeriodKey>("month");

  const periodTabs: { key: PeriodKey; label: string }[] = [
    { key: "day", label: "Hôm nay" },
    { key: "month", label: "Tháng này" },
    { key: "year", label: "Năm nay" },
  ];

  const periodTitle =
    period === "day"
      ? isToday
        ? "Doanh thu hôm nay"
        : `Doanh thu ngày ${formatDayLabel(day)}`
      : period === "month"
        ? isThisMonth
          ? "Doanh thu tháng này"
          : `Doanh thu tháng ${month.split("-")[1]}/${month.split("-")[0]}`
        : isThisYear
          ? "Doanh thu năm nay"
          : `Doanh thu năm ${year}`;

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
        <CardTitle className="text-base">So sánh chi nhánh — {periodTitle}</CardTitle>
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
          {period === "day" && <PeriodPicker paramName="day" type="date" value={day} label="Chọn ngày" />}
          {period === "month" && (
            <PeriodPicker paramName="month" type="month" value={month} label="Chọn tháng" />
          )}
          {period === "year" && (
            <PeriodPicker paramName="year" type="number" value={year} label="Chọn năm" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[260px_1fr]">
          <div className="relative mx-auto">
            <ChartContainer config={chartConfig} className="aspect-square h-[220px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-medium tabular-nums">
                            {currencyFormatter.format(Number(value))}đ
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
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  strokeWidth={0}
                  isAnimationActive={slices.length > 0}
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">% đóng góp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.branchId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            r[period] > 0 ? `var(--chart-${r.colorIndex + 1})` : "var(--muted)",
                        }}
                      />
                      <BranchBadge name={r.branchName} />
                      {r.branchName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(r[period])}đ
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total > 0 ? `${((r[period] / total) * 100).toFixed(0)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!sorted.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Chưa có chi nhánh nào.
                  </TableCell>
                </TableRow>
              )}
              {sorted.length > 0 && (
                <TableRow className="font-medium">
                  <TableCell>Tổng cộng</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(total)}đ
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{total > 0 ? "100%" : "—"}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
