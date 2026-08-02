import Link from "next/link";
import type { ComponentType } from "react";
import { Truck, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchBadge } from "@/components/branch-badge";
import type { OrderToHandle } from "@/lib/orders-to-handle";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { CountdownTimer } from "./countdown-timer";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

function OrderCountdownList({
  title,
  icon: Icon,
  emptyMessage,
  orders,
  hideViewAllLink,
  rangeFilter,
  lateToggle,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  emptyMessage: string;
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
  rangeFilter?: React.ReactNode;
  lateToggle?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          {rangeFilter}
          {lateToggle}
          {!hideViewAllLink && (
            <Link href="/orders" className="text-xs text-muted-foreground hover:underline">
              Xem tất cả →
            </Link>
          )}
        </div>
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
              <BranchBadge name={order.branchName} />
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
  rangeFilter,
  lateToggle,
}: {
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
  rangeFilter?: React.ReactNode;
  lateToggle?: React.ReactNode;
}) {
  return (
    <OrderCountdownList
      title="Đơn hàng sắp tới"
      icon={Truck}
      emptyMessage="Không có đơn nào sắp tới cần giao."
      orders={orders}
      hideViewAllLink={hideViewAllLink}
      rangeFilter={rangeFilter}
      lateToggle={lateToggle}
    />
  );
}

export function PendingCollectionsCard({
  orders,
  hideViewAllLink,
  rangeFilter,
  lateToggle,
}: {
  orders: OrderToHandle[];
  hideViewAllLink?: boolean;
  rangeFilter?: React.ReactNode;
  lateToggle?: React.ReactNode;
}) {
  return (
    <OrderCountdownList
      title="Đơn hàng sắp về"
      icon={PackageCheck}
      emptyMessage="Không có đơn nào sắp về."
      orders={orders}
      hideViewAllLink={hideViewAllLink}
      rangeFilter={rangeFilter}
      lateToggle={lateToggle}
    />
  );
}
