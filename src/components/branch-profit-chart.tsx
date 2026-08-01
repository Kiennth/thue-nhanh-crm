"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export interface BranchProfitRow {
  name: string;
  revenue: number;
  operating: number;
  payroll: number;
  net: number;
}

const CONFIG = {
  net: { label: "Lợi nhuận gộp", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Thanh ngang lợi nhuận gộp theo chi nhánh — thay cho bảng 5 cột (CEO chốt
// 2026-08-01). Màu mã hoá DẤU (lỗ = đỏ), không theo chi nhánh: tên đã nằm
// trên trục, còn lãi/lỗ mới là thứ cần đập vào mắt. Phép tính đầy đủ
// (doanh thu − chi phí − quỹ lương) nằm trong tooltip khi rê chuột.
export function BranchProfitChart({ rows }: { rows: BranchProfitRow[] }) {
  return (
    <ChartContainer
      config={CONFIG}
      className="aspect-auto w-full"
      style={{ height: Math.max(160, rows.length * 44) }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => currencyFormatter.format(v)} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_value, _name, item) => {
                const row = item.payload as BranchProfitRow;
                const line = (label: string, amount: number, cls = "") => (
                  <div className={`flex w-full items-center justify-between gap-4 ${cls}`}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums">{currencyFormatter.format(amount)}đ</span>
                  </div>
                );
                return (
                  <div className="w-full space-y-1">
                    <p className="font-medium">{row.name}</p>
                    {line("Doanh thu", row.revenue)}
                    {line("Chi phí vận hành", -row.operating)}
                    {line("Quỹ lương", -row.payroll)}
                    <div
                      className={`flex w-full items-center justify-between gap-4 border-t pt-1 font-medium ${
                        row.net < 0 ? "text-destructive" : ""
                      }`}
                    >
                      <span>Lợi nhuận gộp</span>
                      <span className="tabular-nums">{currencyFormatter.format(row.net)}đ</span>
                    </div>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="net" radius={4}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.net < 0 ? "var(--destructive)" : "var(--chart-1)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
