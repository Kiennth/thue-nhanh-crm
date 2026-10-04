import Link from "next/link";
import { Bike, Car, CheckCircle2, Store } from "lucide-react";
import type { AgendaItem } from "@/lib/calendar-data";
import type { CalendarDay } from "./timeline";

const hourFmt = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

// Lịch giao / thu hồi theo ngày — việc của kho mỗi ngày.
export function CalendarAgenda({
  days,
  items,
  branchNames,
}: {
  days: CalendarDay[];
  items: AgendaItem[];
  branchNames: Map<string, string>;
}) {
  const byDay = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const key = dayKeyFmt.format(new Date(it.at));
    const list = byDay.get(key) ?? [];
    list.push(it);
    byDay.set(key, list);
  }

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const list = byDay.get(d.date) ?? [];
        const deliveries = list.filter((i) => i.kind === "delivery").length;
        return (
          <section key={d.date} className={`rounded-lg border ${d.isToday ? "border-primary" : ""}`}>
            <header
              className={`flex items-center gap-3 border-b px-4 py-2 ${d.isToday ? "bg-primary/10" : "bg-muted/40"}`}
            >
              <h2 className="text-base font-bold">
                {d.weekday}, {d.label}
                {d.isToday && <span className="ml-2 text-sm font-semibold text-primary">Hôm nay</span>}
              </h2>
              <span className="ml-auto text-sm text-muted-foreground">
                {list.length ? `${deliveries} giao · ${list.length - deliveries} thu hồi` : "Không có lịch"}
              </span>
            </header>
            {list.length > 0 && (
              <ul className="divide-y">
                {list.map((it) => (
                  <li
                    key={`${it.orderId}-${it.kind}`}
                    className={`flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5 ${it.done ? "opacity-60" : ""}`}
                  >
                    <div className="flex w-36 shrink-0 items-center gap-2">
                      <span className="w-12 text-sm font-bold tabular-nums">{hourFmt.format(new Date(it.at))}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          it.kind === "delivery"
                            ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                            : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                        }`}
                      >
                        {it.kind === "delivery" ? "Giao" : "Thu hồi"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <Link href={`/orders/${it.orderId}`} className="font-semibold hover:underline">
                          {it.orderCode}
                        </Link>
                        <span className="font-medium">{it.customer}</span>
                        {it.phone && <span className="text-sm text-muted-foreground tabular-nums">{it.phone}</span>}
                        {it.done && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <CheckCircle2 className="size-3.5" />
                            {it.kind === "delivery" ? "Đã giao" : "Đã thu hồi"}
                          </span>
                        )}
                      </div>
                      {it.items.length > 0 && <p className="text-sm text-muted-foreground">{it.items.join(" · ")}</p>}
                      {it.address && <p className="text-sm">📍 {it.address}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {it.transport === "bike" ? (
                        <Bike className="size-4" />
                      ) : it.transport === "car" ? (
                        <Car className="size-4" />
                      ) : (
                        <Store className="size-4" />
                      )}
                      {it.transport === "bike"
                        ? "Xe máy"
                        : it.transport === "car"
                          ? "Ô tô"
                          : it.kind === "delivery"
                            ? "Khách tự lấy"
                            : "Khách tự trả"}
                      {branchNames.get(it.branchId) && <span>· {branchNames.get(it.branchId)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
