"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTaskAlerts, markTaskAlertsSeen, type TaskAlert } from "@/lib/actions/my-tasks";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { cn } from "@/lib/utils";

// Chuông thông báo trong CRM (Grok tách gọn CRM 10/10, giai đoạn 4) — không
// email/Zalo (CEO ở trên CRM suốt). Tải sau khi trang hiện (không chặn trang),
// làm mới khi đổi trang (tối đa 1 lần/phút) và mỗi 5 phút.

type State = { myDue: number; alerts: TaskAlert[] };
const Ctx = createContext<{ state: State; markSeen: () => void } | null>(null);
const REFRESH_MS = 5 * 60_000;
const MIN_GAP_MS = 60_000;

export function TaskAlertsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ myDue: 0, alerts: [] });
  const lastFetch = useRef(0);

  const load = useCallback((force: boolean) => {
    const t = Date.now();
    if (!force && t - lastFetch.current < MIN_GAP_MS) return;
    lastFetch.current = t;
    getTaskAlerts().then(setState, () => {});
  }, []);

  useEffect(() => {
    load(false);
  }, [pathname, load]);
  useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const markSeen = useCallback(() => {
    const keys = stateRef.current.alerts.filter((a) => !a.seen).map((a) => a.key);
    if (!keys.length) return;
    markTaskAlertsSeen(keys).catch(() => {});
    setState((s) => ({ ...s, alerts: s.alerts.map((a) => ({ ...a, seen: true })) }));
  }, []);

  const value = useMemo(() => ({ state, markSeen }), [state, markSeen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMyDueCount() {
  return useContext(Ctx)?.state.myDue ?? 0;
}

const dueFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function TaskBell() {
  const ctx = useContext(Ctx);
  const router = useRouter();
  if (!ctx) return null;
  const { alerts } = ctx.state;
  const unseen = alerts.filter((a) => !a.seen).length;

  return (
    <DropdownMenu onOpenChange={(open) => !open && ctx.markSeen()}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label={`Thông báo (${unseen} mới)`}>
            <Bell className="size-5" />
            {unseen > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between">
          Thông báo việc
          <span className="text-xs font-normal text-muted-foreground">{alerts.length} việc</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Không có việc sắp tới hạn hay quá hạn.</p>
        ) : (
          alerts.slice(0, 30).map((a) => (
            <DropdownMenuItem
              key={a.key}
              onClick={() => router.push(`/orders/${a.orderId}`)}
              className="flex items-start gap-2 py-2"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  a.seen ? "bg-transparent" : a.kind === "overdue" ? "bg-rose-600" : "bg-amber-500",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  <b>{a.orderCode}</b> · {TASK_TYPE_LABELS[a.taskType]}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.kind === "overdue" ? "Quá hạn" : "Tới hạn trong 1 giờ"} · {dueFmt.format(new Date(a.dueAt))}
                  {!a.mine && " · việc của kho"}
                  {a.customerName ? ` · ${a.customerName}` : ""}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/my-tasks")} className="justify-center text-sm font-medium">
          Mở Việc của tôi
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
