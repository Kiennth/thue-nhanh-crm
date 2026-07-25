import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PeriodStat } from "@/lib/orders-overview";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function GrowthBadge({ growthPct }: { growthPct: number | null }) {
  if (growthPct === null) {
    return <span className="text-xs text-muted-foreground">Chưa có kỳ trước để so sánh</span>;
  }
  const isFlat = Math.round(growthPct) === 0;
  const isUp = growthPct > 0;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const colorClass = isFlat
    ? "text-muted-foreground"
    : isUp
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`}>
      <Icon className="size-3.5" />
      {isUp && !isFlat ? "+" : ""}
      {growthPct.toFixed(1)}% so với kỳ trước
    </span>
  );
}

function PeriodCard({ stat }: { stat: PeriodStat }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{stat.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-2xl font-semibold">{stat.count} đơn</p>
        <p className="text-sm text-muted-foreground">
          Trung bình {currencyFormatter.format(Math.round(stat.avgValue))}đ/đơn
        </p>
        <GrowthBadge growthPct={stat.growthPct} />
        <p className="text-xs text-muted-foreground">
          Dự kiến hết kỳ: ~{stat.projectedCount} đơn (~{currencyFormatter.format(stat.projectedRevenue)}đ)
        </p>
      </CardContent>
    </Card>
  );
}

export function PeriodStatCards({
  week,
  month,
  year,
}: {
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <PeriodCard stat={week} />
      <PeriodCard stat={month} />
      <PeriodCard stat={year} />
    </div>
  );
}
