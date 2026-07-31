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
import { PeriodPicker } from "@/components/period-picker";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import type { EmployeeMonthlyPerformance } from "@/lib/employee-performance-charts";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function rowHeight(count: number) {
  return Math.max(220, count * 44);
}

function EmployeeIncomeBarChart({ rows }: { rows: EmployeeMonthlyPerformance[] }) {
  const config = { totalIncome: { label: "Tổng thu nhập", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rowHeight(rows.length) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => `${currencyFormatter.format(Number(value))}đ`} />}
        />
        <Bar dataKey="totalIncome" fill="var(--color-totalIncome)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

function EmployeeTaskCountBarChart({ rows }: { rows: EmployeeMonthlyPerformance[] }) {
  const config = {
    completedTaskCount: { label: "Số khâu hoàn thành", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rowHeight(rows.length) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="completedTaskCount" fill="var(--color-completedTaskCount)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

const INCOME_COMPOSITION_CONFIG = {
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

export function EmployeeIncomeCompositionChart({ rows }: { rows: EmployeeMonthlyPerformance[] }) {
  return (
    <ChartContainer
      config={INCOME_COMPOSITION_CONFIG}
      className="aspect-auto w-full"
      style={{ height: rowHeight(rows.length) }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => `${currencyFormatter.format(Number(value))}đ`} />}
        />
        {/* flex-wrap: 9 hạng mục không đủ chỗ 1 hàng ở màn hẹp, không wrap
            thì nhãn bị cắt mất chữ. */}
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-3 gap-y-1" />} />
        <Bar dataKey="baseSalary" stackId="income" fill="var(--color-baseSalary)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="totalCommission" stackId="income" fill="var(--color-totalCommission)" />
        <Bar dataKey="installationPayout" stackId="income" fill="var(--color-installationPayout)" />
        <Bar dataKey="removalPayout" stackId="income" fill="var(--color-removalPayout)" />
        <Bar dataKey="supportPayout" stackId="income" fill="var(--color-supportPayout)" />
        <Bar dataKey="deliveryPayout" stackId="income" fill="var(--color-deliveryPayout)" />
        <Bar dataKey="collectionPayout" stackId="income" fill="var(--color-collectionPayout)" />
        <Bar dataKey="overtimePay" stackId="income" fill="var(--color-overtimePay)" />
        <Bar dataKey="bonus" stackId="income" fill="var(--color-bonus)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const TASK_COMPOSITION_CONFIG = Object.fromEntries(
  TASK_TYPE_SEQUENCE.map((taskType, index) => [
    taskType,
    { label: TASK_TYPE_LABELS[taskType], color: `var(--chart-${index + 1})` },
  ]),
) as ChartConfig;

function EmployeeTaskCompositionChart({
  rows,
}: {
  rows: (EmployeeMonthlyPerformance & Record<string, unknown>)[];
}) {
  return (
    <ChartContainer
      config={TASK_COMPOSITION_CONFIG}
      className="aspect-auto w-full"
      style={{ height: rowHeight(rows.length) }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {TASK_TYPE_SEQUENCE.map((taskType, index) => (
          <Bar
            key={taskType}
            dataKey={taskType}
            stackId="tasks"
            fill={`var(--color-${taskType})`}
            radius={
              index === 0
                ? [0, 0, 0, 0]
                : index === TASK_TYPE_SEQUENCE.length - 1
                  ? [0, 4, 4, 0]
                  : undefined
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function EmployeePerformanceChartsSection({
  rows,
  chartMonth,
}: {
  rows: EmployeeMonthlyPerformance[];
  chartMonth: string;
}) {
  const taskRows = rows.map((r) => ({ ...r, ...r.taskTypeCounts }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Hiệu suất nhân viên</h2>
          <p className="text-sm text-muted-foreground">
            Chỉ Giám đốc/Admin/Kế toán xem được — theo tháng đang chọn.
          </p>
        </div>
        <PeriodPicker paramName="chartMonth" type="month" value={chartMonth} label="Chọn tháng biểu đồ" />
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu nhân viên trong tháng này.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tổng thu nhập theo nhân viên</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeIncomeBarChart rows={rows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Số lượt khâu hoàn thành theo nhân viên</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeTaskCountBarChart rows={rows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cơ cấu thu nhập (Lương cứng / Khoán / Thưởng)</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeIncomeCompositionChart rows={rows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cơ cấu khâu nghiệp vụ theo nhân viên</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeTaskCompositionChart rows={taskRows} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
