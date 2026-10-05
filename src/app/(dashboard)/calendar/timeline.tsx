"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BarStatus, CalendarBar, CalendarRow } from "@/lib/calendar-data";
import { STATUS_LABEL } from "./labels";

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  label: string; // "05/10"
  weekday: string; // "T2"…"CN"
  startMs: number;
  endMs: number;
  isToday: boolean;
  isWeekend: boolean;
}

const NAME_COL = 260;
const LANE_H = 24;
const ROW_PAD = 6;

const STATUS_CLASS: Record<BarStatus, string> = {
  reserved: "bg-amber-400/90 text-amber-950 hover:bg-amber-400",
  out: "bg-emerald-500 text-white hover:bg-emerald-600",
  late: "bg-orange-500 text-white hover:bg-orange-600",
  overdue: "bg-red-500 text-white hover:bg-red-600",
  done: "bg-slate-300 text-slate-700 hover:bg-slate-400 dark:bg-slate-600 dark:text-slate-100",
};

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function assignLanes(bars: CalendarBar[]): { bar: CalendarBar; lane: number }[] {
  const laneEnds: number[] = [];
  return bars.map((bar) => {
    const start = Date.parse(bar.start);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = Date.parse(bar.end);
    return { bar, lane };
  });
}

export function CalendarTimeline({
  rows,
  days,
  colWidth,
  nowMs,
}: {
  rows: CalendarRow[];
  days: CalendarDay[];
  colWidth: number;
  nowMs: number;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Cột ngày giãn hết bề ngang khung (CEO 2026-10-05: "chạy hết chiều ngang");
  // colWidth chỉ còn là bề rộng TỐI THIỂU — hẹp hơn thì cuộn ngang.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const effectiveCol = Math.max(colWidth, Math.floor((boxWidth - NAME_COL - 2) / days.length));
  const fromMs = days[0].startMs;
  const toMs = days[days.length - 1].endMs;
  const gridWidth = days.length * effectiveCol;
  const xOf = (ms: number) => ((Math.min(Math.max(ms, fromMs), toMs) - fromMs) / (toMs - fromMs)) * gridWidth;
  const nowX = nowMs >= fromMs && nowMs < toMs ? xOf(nowMs) : null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!rows.length) {
    return (
      <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Không có sản phẩm nào được thuê trong khoảng này.
      </p>
    );
  }

  return (
    // contain:inline-size — lưới rộng không được kéo giãn cả trang (khung
    // nội dung là flex item, min-width tự lấy theo bề rộng lưới), chỉ cuộn
    // ngang bên trong khung này.
    <div
      ref={boxRef}
      className="max-h-[calc(100vh-230px)] w-full overflow-auto rounded-lg border bg-background [contain:inline-size]"
    >
      <div style={{ width: NAME_COL + gridWidth }} className="relative">
        {/* Hàng tiêu đề ngày */}
        <div className="sticky top-0 z-20 flex border-b bg-background">
          <div
            style={{ width: NAME_COL }}
            className="sticky left-0 z-30 shrink-0 border-r bg-background px-3 py-2 text-xs font-semibold text-muted-foreground uppercase"
          >
            Sản phẩm
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              style={{ width: effectiveCol }}
              className={`shrink-0 border-r py-1.5 text-center leading-tight ${
                d.isToday ? "bg-primary/10 text-primary" : d.isWeekend ? "bg-muted/60" : ""
              }`}
            >
              <div className="text-[11px] text-muted-foreground">{d.weekday}</div>
              <div className="text-sm font-semibold tabular-nums">{d.label}</div>
            </div>
          ))}
        </div>

        {rows.map((row) => {
          const expanded = open.has(row.typeId);
          return (
            <div key={row.typeId}>
              <TrackRow
                name={
                  <button
                    type="button"
                    onClick={() => row.serial && row.instances.length > 0 && toggle(row.typeId)}
                    className={`flex w-full items-start gap-1 text-left ${row.serial && row.instances.length ? "cursor-pointer" : "cursor-default"}`}
                    title={row.name}
                  >
                    {row.serial && row.instances.length > 0 ? (
                      expanded ? (
                        <ChevronDown className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <ChevronRight className="mt-0.5 size-4 shrink-0" />
                      )
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span className="line-clamp-2 text-[13px] font-semibold">{row.name}</span>
                    {row.total !== null && (
                      <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {row.total} máy
                      </span>
                    )}
                  </button>
                }
                bars={row.bars}
                days={days}
                colWidth={effectiveCol}
                xOf={xOf}
                fromMs={fromMs}
                toMs={toMs}
                total={row.total}
                nowX={nowX}
              />
              {expanded &&
                row.instances.map((inst) => (
                  <TrackRow
                    key={inst.id}
                    sub
                    name={
                      <span
                        className={`block truncate pl-5 font-mono text-xs ${
                          inst.placeholder ? "text-red-600 italic" : "text-muted-foreground"
                        }`}
                        title={inst.placeholder ? "Máy tạm CHỜ MUA — chưa có máy thật" : inst.label}
                      >
                        {inst.placeholder ? "CHỜ MUA · " : ""}
                        {inst.label}
                      </span>
                    }
                    bars={inst.bars}
                    days={days}
                    colWidth={effectiveCol}
                    xOf={xOf}
                    fromMs={fromMs}
                    toMs={toMs}
                    total={null}
                    nowX={nowX}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackRow({
  name,
  bars,
  days,
  colWidth,
  xOf,
  fromMs,
  toMs,
  total,
  nowX,
  sub = false,
}: {
  name: React.ReactNode;
  bars: CalendarBar[];
  days: CalendarDay[];
  colWidth: number;
  xOf: (ms: number) => number;
  fromMs: number;
  toMs: number;
  total: number | null;
  nowX: number | null;
  sub?: boolean;
}) {
  const placed = assignLanes(bars);
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const height = lanes * LANE_H + ROW_PAD * 2;

  return (
    <div className={`flex border-b ${sub ? "bg-muted/20" : ""}`} style={{ height }}>
      <div
        style={{ width: NAME_COL }}
        className={`sticky left-0 z-10 flex shrink-0 items-center border-r px-2 ${sub ? "bg-muted/40" : "bg-background"}`}
      >
        {name}
      </div>
      <div className="relative shrink-0" style={{ width: days.length * colWidth }}>
        {/* Nền ô ngày + số máy còn trống (hàng serial) */}
        <div className="absolute inset-0 flex">
          {days.map((d) => {
            let cls = d.isToday ? "bg-primary/5" : d.isWeekend ? "bg-muted/40" : "";
            let free: number | null = null;
            if (total !== null) {
              const busy = bars
                .filter((b) => Date.parse(b.start) < d.endMs && Date.parse(b.end) > d.startMs)
                .reduce((s, b) => s + b.quantity, 0);
              free = total - busy;
              if (free < 0) cls = "bg-red-500/15";
              else if (free === 0) cls = "bg-amber-400/15";
            }
            return (
              <div
                key={d.date}
                style={{ width: colWidth }}
                className={`relative shrink-0 border-r ${cls}`}
                title={free !== null ? `${d.label}: còn ${free}/${total} máy trống` : undefined}
              >
                {free !== null && (
                  <span
                    className={`absolute right-1 bottom-0.5 text-[10px] tabular-nums ${
                      free < 0 ? "font-bold text-red-600" : free === 0 ? "text-amber-700" : "text-muted-foreground/70"
                    }`}
                  >
                    {free}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {nowX !== null && (
          <div aria-hidden className="absolute top-0 bottom-0 z-[5] w-0.5 bg-red-500/70" style={{ left: nowX }} />
        )}
        {placed.map(({ bar, lane }) => {
          const startMs = Date.parse(bar.start);
          const endMs = Date.parse(bar.end);
          const left = xOf(startMs);
          const width = Math.max(xOf(endMs) - left, 6);
          const cutLeft = startMs < fromMs;
          const cutRight = endMs > toMs;
          const label = `${bar.orderCode} · ${bar.customer}${bar.quantity > 1 ? ` ×${bar.quantity}` : ""}`;
          return (
            <Link
              key={`${bar.orderId}-${lane}`}
              href={`/orders/${bar.orderId}`}
              title={`${label}\n${timeFmt.format(startMs)} → ${timeFmt.format(endMs)}\n${STATUS_LABEL[bar.status]}${
                bar.placeholder ? "\nCó máy CHỜ MUA (thiếu hàng)" : ""
              }`}
              className={`absolute z-[6] flex items-center overflow-hidden px-1.5 text-[11px] font-semibold whitespace-nowrap shadow-sm transition-colors ${
                STATUS_CLASS[bar.status]
              } ${cutLeft ? "" : "rounded-l-md"} ${cutRight ? "" : "rounded-r-md"} ${
                bar.placeholder ? "ring-2 ring-red-600 ring-offset-1 ring-offset-background" : ""
              }`}
              style={{ left, width, top: ROW_PAD + lane * LANE_H, height: LANE_H - 4 }}
            >
              {cutLeft && "‹ "}
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
