import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const currencyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Thanh tiến độ thu tiền — collected + unpaid LUÔN cộng đúng bằng vatRevenue
// (cùng nền giá đã gồm VAT, xem migration 20260806140000) nên an toàn để vẽ
// xếp chồng 100% mà không sợ lệch số như khi trộn totalRevenue (chưa VAT)
// với unpaidAmount (đã VAT). Server component thuần (không cần recharts cho
// 1 thanh 2 màu) — nhẹ hơn và dễ đọc hơn 1 donut cho đúng 2 lát.
export function OrdersCollectionProgress({
  vatRevenue,
  unpaidAmount,
}: {
  vatRevenue: number;
  unpaidAmount: number;
}) {
  const collected = Math.max(0, vatRevenue - unpaidAmount);
  const collectedPct = vatRevenue > 0 ? Math.round((collected / vatRevenue) * 100) : 0;
  const unpaidPct = vatRevenue > 0 ? 100 - collectedPct : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tiến độ thu tiền</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
            {collected > 0 && (
              <div
                className="h-full bg-[var(--chart-1)]"
                style={{ width: `${collectedPct}%` }}
                title={`Đã thu ${collectedPct}%`}
              />
            )}
            {unpaidAmount > 0 && (
              <div
                className="h-full bg-destructive"
                style={{ width: `${unpaidPct}%` }}
                title={`Còn thiếu ${unpaidPct}%`}
              />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
              Đã thu ({collectedPct}%)
            </div>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {currencyFormatter.format(Math.round(collected))}đ
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full bg-destructive" />
              Còn thiếu ({unpaidPct}%)
            </div>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-destructive">
              {currencyFormatter.format(Math.round(unpaidAmount))}đ
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
