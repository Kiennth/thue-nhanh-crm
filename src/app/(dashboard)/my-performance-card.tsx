import { Trophy, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyPerformance } from "@/lib/my-performance";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}

export function MyPerformanceCard({ perf }: { perf: MyPerformance }) {
  const maxThreshold = perf.tiers.length
    ? perf.tiers[perf.tiers.length - 1].thresholdAmount
    : 0;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-primary" />
          Thu nhập của bạn — Tháng {formatMonthLabel(perf.month)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-11">
          <div>
            <p className="text-xs text-muted-foreground">Lương cứng</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.baseSalary)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tổng khoán</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.totalCommission)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phí Lắp đặt</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.installationPayout)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phí Tháo dỡ</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.removalPayout)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phí Support</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.supportPayout)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phí Giao hàng</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.deliveryPayout)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phí Thu hồi</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.collectionPayout)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">OT</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.overtimePay)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Thưởng đạt được</p>
            <p className="text-2xl font-semibold text-primary">
              {currencyFormatter.format(perf.bonus)}đ
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tổng thu nhập</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.totalIncome)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Khâu đã hoàn thành</p>
            <p className="flex items-center gap-1 text-2xl font-semibold">
              <CheckCircle2 className="size-5 text-primary" />
              {perf.completedTaskCount}
            </p>
          </div>
        </div>

        {perf.tiers.length > 0 && (
          <div className="space-y-2">
            <div className="relative pt-1 pb-9">
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, maxThreshold > 0 ? (perf.totalCommission / maxThreshold) * 100 : 0)}%`,
                  }}
                />
                {perf.tiers.map((tier) => (
                  <div
                    key={tier.tierNumber}
                    className={`absolute top-0 h-3 w-0.5 ${tier.achieved ? "bg-primary-foreground/60" : "bg-border"}`}
                    style={{
                      left: `${maxThreshold > 0 ? (tier.thresholdAmount / maxThreshold) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
              {perf.tiers.map((tier) => (
                <div
                  key={tier.tierNumber}
                  className="absolute top-5 -translate-x-full text-right"
                  style={{
                    left: `${maxThreshold > 0 ? (tier.thresholdAmount / maxThreshold) * 100 : 0}%`,
                  }}
                >
                  <p
                    className={`text-xs font-medium ${tier.achieved ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {tier.achieved ? "✓ " : ""}
                    {currencyFormatter.format(tier.thresholdAmount)}đ
                  </p>
                  <p className={`text-xs ${tier.achieved ? "text-primary" : "text-muted-foreground"}`}>
                    🏁 +{currencyFormatter.format(tier.bonusAmount)}đ
                  </p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {perf.nextTier ? (
                <>
                  Còn{" "}
                  <span className="font-medium text-foreground">
                    {currencyFormatter.format(perf.nextTier.thresholdAmount - perf.totalCommission)}đ
                  </span>{" "}
                  nữa để lên <span className="font-medium text-foreground">Bậc {perf.nextTier.tierNumber}</span>{" "}
                  (thưởng {currencyFormatter.format(perf.nextTier.bonusAmount)}đ)
                </>
              ) : (
                <span className="font-medium text-primary">
                  🏆 Đã đạt bậc thưởng cao nhất tháng này!
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
