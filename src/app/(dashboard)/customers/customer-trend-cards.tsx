"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
// import type không kéo runtime của customer-reports.ts (nó phụ thuộc
// vn-time.ts, đánh dấu "server-only") — an toàn để dùng trong client component.
import type { ReturningRatePoint } from "@/lib/customer-reports";
import { ReturningRateChart } from "./returning-rate-chart";

// Đo giữ được khách cũ ở lại — tỉ lệ theo TỪNG THÁNG nên nhúc nhích thật,
// khác ô "Khách quay lại (2+ đơn)" cộng dồn từ đầu gần như đứng yên.
export function ReturningRateCard({
  ratePoints,
}: {
  ratePoints: { month: string; activeCount: number; returningCount: number }[];
}) {
  const [showChart, setShowChart] = useState(false);
  const points: ReturningRatePoint[] = ratePoints.map((p) => ({
    ...p,
    rate: p.activeCount > 0 ? (p.returningCount / p.activeCount) * 100 : null,
  }));
  const current = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta =
    current?.rate != null && previous?.rate != null ? current.rate - previous.rate : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Tỉ lệ khách quay lại theo tháng</CardTitle>
          <p className="text-sm text-muted-foreground">
            Trong số khách có thuê trong tháng, bao nhiêu phần trăm đã từng thuê trước đó.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowChart((v) => !v)}>
          {showChart ? "Ẩn" : "Xem cả năm"}
          {showChart ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {current?.rate != null ? `${current.rate.toFixed(0)}%` : "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {current ? `${current.returningCount}/${current.activeCount} khách tháng này` : ""}
          </p>
          {delta !== null && (
            <p
              className={`flex items-center gap-1 text-xs ${
                delta >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {delta >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(0)} điểm so với tháng trước
            </p>
          )}
        </div>

        {showChart && <ReturningRateChart points={points} />}
      </CardContent>
    </Card>
  );
}
