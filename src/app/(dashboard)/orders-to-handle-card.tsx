import Link from "next/link";
import { Truck, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OrderToHandle } from "@/lib/orders-to-handle";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

const BUCKET_LABELS = {
  overdue: "Quá hạn",
  today: "Hôm nay",
  tomorrow: "Ngày mai",
  upcoming: "Sắp tới",
} as const;

const BUCKET_ORDER = ["overdue", "today", "tomorrow", "upcoming"] as const;

export function OrdersToHandleCard({ orders }: { orders: OrderToHandle[] }) {
  const byBucket = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: orders.filter((o) => o.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Đơn hàng cần xử lý</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!byBucket.length && (
          <p className="text-sm text-muted-foreground">Không có đơn nào cần giao/thu hồi sắp tới.</p>
        )}
        {byBucket.map(({ bucket, items }) => (
          <div key={bucket} className="space-y-2">
            <p
              className={`text-sm font-medium ${bucket === "overdue" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {BUCKET_LABELS[bucket]}
            </p>
            <div className="space-y-1">
              {items.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {order.actionLabel === "Giao hàng" ? (
                      <Truck className="size-4 text-muted-foreground" />
                    ) : (
                      <PackageCheck className="size-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{order.orderCode}</span>
                    <span className="text-muted-foreground">{order.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{dateFormatter.format(new Date(order.actionDate))}</span>
                    <Badge variant={bucket === "overdue" ? "destructive" : "outline"}>
                      {order.actionLabel}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
