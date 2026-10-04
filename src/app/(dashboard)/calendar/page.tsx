import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, BRANCH_SCOPED_ROLES } from "@/lib/roles";
import { vnStartOfDay, vnTodayString } from "@/lib/vn-time";
import { loadAgenda, loadTimeline } from "@/lib/calendar-data";
import { calendarFeedToken } from "@/lib/calendar-feed";
import { SearchInput } from "@/components/search-input";
import { CalendarTimeline, type CalendarDay } from "./timeline";
import { STATUS_LABEL } from "./labels";
import { CalendarAgenda } from "./agenda";
import { SubscribeButton } from "./subscribe-button";

const SPANS = [7, 14, 30] as const;
const COL_WIDTH: Record<number, number> = { 7: 150, 14: 84, 30: 46 };
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

// Server Component chạy 1 lần mỗi request — vạch "bây giờ" lấy theo lúc đó.
function nowMs(): number {
  return Date.now();
}

// "YYYY-MM-DD" ± n ngày — tính trên UTC thuần nên không dính múi giờ.
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

// Lịch thuê (CEO 2026-10-04, học Booqable): tab "Theo sản phẩm" = timeline
// mỗi mã hàng một dòng; tab "Giao / Thu hồi" = việc kho theo ngày. Chỉ xem,
// bấm thanh/mã đơn để mở đơn.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; span?: string; branch?: string; q?: string; all?: string }>;
}) {
  const params = await searchParams;
  const employee = await requireRole([...ALL_ROLES]);
  const view = params.view === "agenda" ? "agenda" : "products";
  const today = vnTodayString();
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const spanNum = Number(params.span);
  const span = (SPANS as readonly number[]).includes(spanNum) ? spanNum : view === "agenda" ? 7 : 14;
  const query = params.q?.trim() ?? "";
  const showAll = params.all === "1";

  // Kho: mặc định Cửa hàng trưởng/Kỹ thuật xem kho mình, chọn "Tất cả kho"
  // (branch=all) để xem chung; quản lý mặc định tất cả.
  const isScoped = BRANCH_SCOPED_ROLES.includes(employee.role) && !!employee.branch_id;
  const branchParam = params.branch ?? (isScoped ? employee.branch_id! : "all");
  const branchId = branchParam !== "all" && UUID_RE.test(branchParam) ? branchParam : null;

  const days: CalendarDay[] = Array.from({ length: span }, (_, i) => {
    const date = addDays(from, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      weekday: WEEKDAYS[dow],
      startMs: vnStartOfDay(date).getTime(),
      endMs: vnStartOfDay(addDays(date, 1)).getTime(),
      isToday: date === today,
      isWeekend: dow === 0 || dow === 6,
    };
  });
  const fromIso = new Date(days[0].startMs).toISOString();
  const toIso = new Date(days[days.length - 1].endMs).toISOString();

  const supabase = await createClient();
  const [branchesRes, timeline, agenda, token] = await Promise.all([
    supabase.from("branches").select("id, name").eq("is_active", true).order("position"),
    view === "products" ? loadTimeline({ from: fromIso, to: toIso, branchId, query, showAll }) : null,
    view === "agenda" ? loadAgenda(fromIso, toIso, branchId) : null,
    calendarFeedToken(employee.id),
  ]);
  const branches = branchesRes.data ?? [];
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  // Chỉ đường dẫn — tên miền ghép ở trình duyệt (trên Workers, host của
  // request trong trang và NEXT_PUBLIC_SITE_URL lúc build đều ra localhost).
  const feedPath = `/api/calendar/ical/${token}.ics${branchId ? `?branch=${branchId}` : ""}`;

  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = {
      view: view === "agenda" ? "agenda" : null,
      from: from === today ? null : from,
      span: String(span),
      branch: params.branch ?? null,
      q: query || null,
      all: showAll ? "1" : null,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
    }`;
  const step = view === "agenda" ? span : Math.max(1, Math.floor(span / 2));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Lịch</h1>
        <SubscribeButton path={feedPath} branchName={branchId ? (branchNames.get(branchId) ?? null) : null} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="inline-flex rounded-lg border p-1">
          <Link href={href({ view: null, span: null })} className={pill(view === "products")}>
            Theo sản phẩm
          </Link>
          <Link href={href({ view: "agenda", span: null })} className={pill(view === "agenda")}>
            Giao / Thu hồi
          </Link>
        </nav>

        <div className="inline-flex items-center rounded-lg border p-1">
          <Link href={href({ from: addDays(from, -step) })} className={pill(false)} aria-label="Lùi">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={href({ from: null })} className={pill(from === today)}>
            Hôm nay
          </Link>
          <Link href={href({ from: addDays(from, step) })} className={pill(false)} aria-label="Tới">
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="inline-flex rounded-lg border p-1">
          {SPANS.map((s) => (
            <Link key={s} href={href({ span: String(s) })} className={pill(span === s)}>
              {s} ngày
            </Link>
          ))}
        </div>

        <div className="inline-flex flex-wrap rounded-lg border p-1">
          <Link href={href({ branch: "all" })} className={pill(!branchId)}>
            Tất cả kho
          </Link>
          {branches.map((b) => (
            <Link key={b.id} href={href({ branch: b.id })} className={pill(branchId === b.id)}>
              {b.name}
            </Link>
          ))}
        </div>
      </div>

      {view === "products" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              key={query}
              paramName="q"
              placeholder="Lọc theo tên sản phẩm — gõ rồi Enter..."
              value={query}
              className="w-full max-w-md"
            />
            <Link
              href={href({ all: showAll ? null : "1" })}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showAll ? "Chỉ hiện mã có đơn" : "Hiện cả mã không có đơn"}
            </Link>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
              {(["reserved", "out", "overdue", "done"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-3 rounded-sm ${
                      s === "reserved"
                        ? "bg-amber-400"
                        : s === "out"
                          ? "bg-emerald-500"
                          : s === "overdue"
                            ? "bg-red-500"
                            : "bg-slate-300"
                    }`}
                  />
                  {STATUS_LABEL[s]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm ring-2 ring-red-600" />
                Có máy CHỜ MUA
              </span>
            </div>
          </div>
          <CalendarTimeline
            rows={timeline!.rows}
            days={days}
            colWidth={COL_WIDTH[span]}
            nowMs={nowMs()}
          />
          <p className="text-xs text-muted-foreground">
            Số nhỏ góc ô = máy serial còn trống ngày đó (đỏ = đặt vượt số máy). Bấm tên sản phẩm có mũi tên để xem
            từng máy.
            {timeline!.truncated > 0 && ` Đang ẩn ${timeline!.truncated} mã — gõ tên để lọc.`}
          </p>
        </>
      )}

      {view === "agenda" && <CalendarAgenda days={days} items={agenda!} branchNames={branchNames} />}
    </div>
  );
}
