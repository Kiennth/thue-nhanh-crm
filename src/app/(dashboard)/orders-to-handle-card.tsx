import Link from "next/link";
import type { ComponentType } from "react";
import { Truck, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderToHandle } from "@/lib/orders-to-handle";
import { CountdownTimer } from "./countdown-timer";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

function OrderCountdownList({
  title,
  icon: Icon,
  emptyMessage,
  orders,
  hideViewAllLink,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  emptyMessage: string;
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {!hideViewAllLink && (
          <Link href="/orders" className="text-xs text-muted-foreground hover:underline">
            Xem tất cả →
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {!orders.length && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center justify-between rounded-lg border p-2 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{order.orderCode}</span>
              <span className="text-muted-foreground">{order.customerName}</span>
              <span className="text-xs text-muted-foreground">· {order.branchName}</span>
            </div>
            <div className="flex flex-col items-end">
              <CountdownTimer targetDate={order.actionDate} />
              <span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(order.actionDate))}</span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function UpcomingDeliveriesCard({
  orders,
  hideViewAllLink,
}: {
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
}) {
  return (
    <OrderCountdownList
      title="Đơn hàng sắp tới"
      icon={Truck}
      emptyMessage="Không có đơn nào sắp tới cần giao."
      orders={orders}
      hideViewAllLink={hideViewAllLink}
    />
  );
}

export function PendingCollectionsCard({
  orders,
  hideViewAllLink,
}: {
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
}) {
  return (
    <OrderCountdownList
      title="Đơn hàng sắp về"
      icon={PackageCheck}
      emptyMessage="Không có đơn nào sắp về."
      orders={orders}
      hideViewAllLink={hideViewAllLink}
    />
  );
}
