"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Hạng mục -> màu gán theo sort_order CỐ ĐỊNH (Thuê nhà luôn chart-1, Điện
// luôn chart-2...) — đổi bộ lọc hay thiếu hạng mục cũng không được nhảy màu,
// vì màu đi theo hạng mục chứ không theo vị trí trong dữ liệu hiện có.
const CATEGORY_COLOR_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-7)",
  "var(--chart-9)",
  "var(--chart-10)",
];

export function categoryColor(index: number): string {
  return CATEGORY_COLOR_SLOTS[index % CATEGORY_COLOR_SLOTS.length];
}

export interface BranchExpensePoint {
  branch: string;
  // key = id hạng mục, value = tổng tiền
  [categoryId: string]: string | number;
}

// Cột chồng ngang: mỗi hàng một chi nhánh, mỗi mảng màu một hạng mục — câu
// trả lời trực tiếp cho "kho nào tốn nhất, tốn ở khoản gì".
export function BranchExpenseChart({
  points,
  categories,
}: {
  points: BranchExpensePoint[];
  categories: { id: string; name: string }[];
}) {
  const config = Object.fromEntries(
    categories.map((c, i) => [c.id, { label: c.name, color: categoryColor(i) }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(180, points.length * 52) }}
    >
      <BarChart data={points} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="branch" width={90} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex flex-1 items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    {config[name as string]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {currencyFormatter.format(Number(value))}đ
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-3 gap-y-1" />} />
        {categories.map((c, i) => (
          <Bar
            key={c.id}
            dataKey={c.id}
            stackId="expense"
            fill={`var(--color-${c.id})`}
            radius={
              i === 0 ? [0, 0, 0, 0] : i === categories.length - 1 ? [0, 4, 4, 0] : undefined
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export interface ExpenseTrendPoint {
  month: string;
  total: number;
}

function shortMonth(month: string) {
  const [year, m] = month.split("-");
  return `Th${Number(m)}/${year.slice(2)}`;
}

// Một chuỗi duy nhất → không cần chú giải; đường vì đây là biến động theo
// thời gian.
export function ExpenseTrendChart({ points }: { points: ExpenseTrendPoint[] }) {
  const config = { total: { label: "Tổng chi", color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <LineChart data={points} margin={{ top: 12, left: 12, right: 12 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          width={64}
          tickFormatter={(v) => currencyFormatter.format(v)}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) =>
                `Tháng ${String(label).split("-")[1]}/${String(label).split("-")[0]}`
              }
              formatter={(value) => `${currencyFormatter.format(Number(value))}đ`}
            />
          }
        />
        <Line
          dataKey="total"
          type="monotone"
          stroke="var(--color-total)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
