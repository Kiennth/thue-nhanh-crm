import Link from "next/link";
import type { ComponentType } from "react";
import { Truck, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BranchBadge } from "@/components/branch-badge";
import type { OrderToHandle } from "@/lib/orders-to-handle";
import { groupOrdersByDay } from "@/lib/order-day-groups";
import { VN_TIME_ZONE } from "@/lib/date-format";
import { CountdownTimer } from "./countdown-timer";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

// Mỗi cụm ngày 1 màu trong dải categorical --chart-1..10 (đã kiểm định
// sáng/tối, dùng chung với BranchBadge) — xoay vòng theo thứ tự cụm để các
// ngày liền nhau nổi bật, dễ phân biệt khi lướt nhanh.
const DAY_GROUP_COLOR_VARS = Array.from({ length: 10 }, (_, i) => `--chart-${i + 1}`);

// Bộ màu nhận diện của từng khối (CEO 2026-09-02: "chia ô, chia khung, tô
// màu cho nổi bật") — sắp tới = xanh dương (hàng GIAO ĐI), sắp về = hổ
// phách (hàng THU VỀ). Class Tailwind tĩnh kèm biến thể dark, không dựng
// chuỗi động để JIT không bỏ sót.
interface CardAccent {
  topBorder: string;
  headerBg: string;
  iconChip: string;
  countChip: string;
}

const BLUE_ACCENT: CardAccent = {
  topBorder: "border-t-4 border-t-blue-500",
  headerBg: "bg-blue-500/5",
  iconChip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  countChip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

const AMBER_ACCENT: CardAccent = {
  topBorder: "border-t-4 border-t-amber-500",
  headerBg: "bg-amber-500/5",
  iconChip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  countChip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function OrderCountdownList({
  title,
  icon: Icon,
  emptyMessage,
  orders,
  now,
  hideViewAllLink,
  rangeFilter,
  lateToggle,
  accent,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  emptyMessage: string;
  orders: OrderToHandle[];
  now: Date;
  hideViewAllLink?: boolean;
  rangeFilter?: React.ReactNode;
  lateToggle?: React.ReactNode;
  accent: CardAccent;
}) {
  const groups = groupOrdersByDay(orders, now);

  return (
    <Card className={`overflow-hidden pt-0 ${accent.topBorder}`}>
      {/* flex-wrap + gap-y: màn hẹp (mobile 375px) tiêu đề và cụm lọc/badge
          không đủ chỗ 1 hàng — không wrap thì badge "Trễ hạn (N)" bị cắt chữ
          (card có overflow hidden). */}
      <CardHeader
        className={`flex flex-wrap items-center justify-between gap-y-2 border-b py-3 ${accent.headerBg}`}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`flex size-7 items-center justify-center rounded-md ${accent.iconChip}`}>
            <Icon className="size-4" />
          </span>
          {title}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${accent.countChip}`}
          >
            {orders.length}
          </span>
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
      <CardContent className="space-y-3">
        {!orders.length && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
        {groups.map((group, i) => {
          const colorVar = DAY_GROUP_COLOR_VARS[i % DAY_GROUP_COLOR_VARS.length];
          return (
            // Mỗi cụm ngày là 1 KHUNG riêng: viền trái đậm ăn theo màu badge
            // ngày, nền hơi chìm để các dòng đơn (nền trắng) nổi lên thành ô.
            <div
              key={group.dateStr}
              className="space-y-1.5 rounded-xl border bg-muted/40 p-2"
              style={{ borderLeftWidth: 4, borderLeftColor: `var(${colorVar})` }}
            >
              <div className="flex items-center gap-2">
                <Badge
                  style={{
                    backgroundColor: `var(${colorVar})`,
                    color: `var(${colorVar}-fg)`,
                  }}
                >
                  {group.dateLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">{group.orders.length} đơn</span>
              </div>
              {group.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border bg-background p-2 text-sm shadow-xs transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{order.orderCode}</span>
                    {/* Tên khách là thông tin chính — để màu chữ chuẩn, không
                        dùng muted (CEO 2026-08-09: chữ xám trên nền trắng
                        nhìn mờ so với bảng các trang khác). */}
                    <span>{order.customerName}</span>
                    <BranchBadge name={order.branchName} />
                  </div>
                  <div className="flex flex-col items-end">
                    <CountdownTimer targetDate={order.actionDate} />
                    <span className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(order.actionDate))}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function UpcomingDeliveriesCard({
  orders,
  now,
  hideViewAllLink,
  rangeFilter,
  lateToggle,
}: {
  orders: OrderToHandle[];
  now: Date;
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
      now={now}
      hideViewAllLink={hideViewAllLink}
      rangeFilter={rangeFilter}
      lateToggle={lateToggle}
      accent={BLUE_ACCENT}
    />
  );
}

export function PendingCollectionsCard({
  orders,
  now,
  hideViewAllLink,
  rangeFilter,
  lateToggle,
}: {
  orders: OrderToHandle[];
  now: Date;
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
      now={now}
      hideViewAllLink={hideViewAllLink}
      rangeFilter={rangeFilter}
      lateToggle={lateToggle}
      accent={AMBER_ACCENT}
    />
  );
}
