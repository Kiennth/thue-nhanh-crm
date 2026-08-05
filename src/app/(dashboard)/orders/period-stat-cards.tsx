import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { PeriodStat } from "@/lib/orders-overview";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

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

function PeriodCard({ stat, unitLabel }: { stat: PeriodStat; unitLabel: string }) {
  return (
    <StatCard label={stat.label} value={`${stat.count} ${unitLabel}`}>
      <p className="text-sm text-muted-foreground">
        Trung bình {currencyFormatter.format(Math.round(stat.avgValue))}đ/{unitLabel}
      </p>
      <GrowthBadge growthPct={stat.growthPct} />
      <p className="text-xs text-muted-foreground">
        Dự kiến hết kỳ: ~{stat.projectedCount} {unitLabel} (~
        {currencyFormatter.format(stat.projectedRevenue)}đ)
      </p>
    </StatCard>
  );
}

export function PeriodStatCards({
  week,
  month,
  year,
  unitLabel = "đơn",
}: {
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  unitLabel?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <PeriodCard stat={week} unitLabel={unitLabel} />
      <PeriodCard stat={month} unitLabel={unitLabel} />
      <PeriodCard stat={year} unitLabel={unitLabel} />
    </div>
  );
}
