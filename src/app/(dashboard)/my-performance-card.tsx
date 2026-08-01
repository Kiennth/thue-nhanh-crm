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
        {/* 5 số chính luôn hiện, Tổng thu nhập đứng đầu; 6 khoản khoán dịch
            vụ chi tiết chỉ hiện khi CÓ phát sinh trong tháng — hàng dài ô 0đ
            không nói lên gì, ẩn đi là card tự co còn 1 hàng (CEO chốt
            2026-08-01). Số chi tiết đầy đủ vẫn luôn có ở Bảng lương. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Tổng thu nhập</p>
            <p className="text-2xl font-semibold text-primary">
              {currencyFormatter.format(perf.totalIncome)}đ
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lương cứng</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.baseSalary)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tổng khoán</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.totalCommission)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Thưởng đạt được</p>
            <p className="text-2xl font-semibold">{currencyFormatter.format(perf.bonus)}đ</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Khâu đã hoàn thành</p>
            <p className="flex items-center gap-1 text-2xl font-semibold">
              <CheckCircle2 className="size-5 text-primary" />
              {perf.completedTaskCount}
            </p>
          </div>
          {(
            [
              ["Lắp đặt", perf.installationPayout],
              ["Tháo dỡ", perf.removalPayout],
              ["Support", perf.supportPayout],
              ["Giao hàng", perf.deliveryPayout],
              ["Thu hồi", perf.collectionPayout],
              ["OT", perf.overtimePay],
            ] as const
          )
            .filter(([, value]) => value > 0)
            .map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{currencyFormatter.format(value)}đ</p>
              </div>
            ))}
        </div>

        {perf.tiers.length > 0 && (
          <div className="space-y-2">
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
            {/* Nhãn từng mốc thưởng — dùng flex-wrap thay vì absolute canh
                đúng dưới vạch mốc, vì absolute không co giãn được, dễ chồng
                chữ lên nhau khi màn hẹp. */}
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              {perf.tiers.map((tier) => (
                <div key={tier.tierNumber}>
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
