import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/roles";
import { vnStartOfDay, vnTodayString } from "@/lib/vn-time";
import { loadJobs, loadShifts } from "@/lib/work-schedule";
import { calendarFeedToken } from "@/lib/calendar-feed";
import { branchColorVar } from "@/components/branch-badge";
import { SubscribeButton } from "../calendar/subscribe-button";
import { ScheduleGrid, type GridDay, type GridGroup } from "./schedule-grid";
import { CopyWeekButton } from "./copy-week-button";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const hhmm = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

// Lịch làm việc (CEO 2026-10-05): ca trực theo tuần + việc được giao.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; branch?: string }>;
}) {
  const me = await getCurrentEmployee();
  if (!me || !ALL_ROLES.includes(me.role)) return null;
  const { week, branch } = await searchParams;
  const today = vnTodayString();
  const weekStart = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const weekEnd = addDays(weekStart, 7);
  const branchId = branch && UUID_RE.test(branch) ? branch : null;
  const manageAll = ["giam_doc", "admin", "ke_toan"].includes(me.role);

  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data: employees }, { data: branches }, shifts, jobs, token] = await Promise.all([
    db.from("employees").select("id, name, role, branch_id").eq("is_active", true),
    db.from("branches").select("id, name").eq("is_active", true).order("position"),
    loadShifts(db, weekStart, weekEnd),
    loadJobs(db, vnStartOfDay(weekStart).toISOString(), vnStartOfDay(weekEnd).toISOString()),
    calendarFeedToken(me.id, "schedule"),
  ]);
  const branchList = (branches ?? []) as { id: string; name: string }[];
  const emps = ((employees ?? []) as { id: string; name: string; role: keyof typeof ROLE_LABELS; branch_id: string | null }[])
    .filter((e) => !branchId || e.branch_id === branchId)
    .sort(
      (a, b) =>
        ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role) || a.name.localeCompare(b.name, "vi"),
    );

  const groups: GridGroup[] = [...branchList.map((b) => ({ id: b.id as string | null, name: b.name })), { id: null, name: "Chưa gán kho" }]
    .map((b) => ({
      key: b.id ?? "none",
      label: b.id ? `Kho ${b.name}` : b.name,
      color: b.id ? branchColorVar(b.name) : null,
      employees: emps
        .filter((e) => e.branch_id === b.id)
        .map((e) => ({
          id: e.id,
          name: e.name,
          roleLabel: ROLE_LABELS[e.role],
          branchId: e.branch_id,
          canEdit: manageAll || (me.role === "cua_hang_truong" && e.branch_id === me.branch_id),
        })),
    }))
    .filter((g) => g.employees.length);

  const days: GridDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      isToday: date === today,
    };
  });
  const gridJobs = jobs.map((j) => ({
    employeeId: j.employeeId,
    date: dayKey.format(new Date(j.at)),
    time: hhmm.format(new Date(j.at)),
    kind: j.kind,
    orderId: j.orderId,
    orderCode: j.orderCode,
    customer: j.customer,
  }));
  const canSchedule = manageAll || me.role === "cua_hang_truong";
  const href = (over: { week?: string; branch?: string | null }) => {
    const p = new URLSearchParams();
    const w = over.week ?? weekStart;
    if (w !== mondayOf(today)) p.set("week", w);
    const b = over.branch === undefined ? branchId : over.branch;
    if (b) p.set("branch", b);
    return `/schedule${p.toString() ? `?${p}` : ""}`;
  };
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`;
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lịch làm việc</h1>
          <p className="text-sm text-muted-foreground">
            Ca trực theo kho + việc được giao trên đơn (giao, thu hồi, lắp đặt, tháo dỡ, hỗ trợ).
            {canSchedule ? " Bấm vào ô (hoặc dấu +) để xếp ca." : ""}
          </p>
        </div>
        <SubscribeButton
          path={`/api/schedule/ical/${token}.ics`}
          buttonLabel="Đăng ký lịch của tôi"
          title="Lịch làm việc của tôi trên Google Calendar"
          description="Link riêng của bạn: ca trực + việc được giao (giao/thu hồi/lắp đặt...). Đừng gửi cho người khác."
          footnote="Lịch gồm 2 tuần trước đến 2 tháng tới; Google tự cập nhật vài giờ một lần."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border p-1">
          <Link href={href({ week: addDays(weekStart, -7) })} className={pill(false)} aria-label="Tuần trước">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={href({ week: mondayOf(today) })} className={pill(weekStart === mondayOf(today))}>
            Tuần này
          </Link>
          <Link href={href({ week: addDays(weekStart, 7) })} className={pill(false)} aria-label="Tuần sau">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <span className="text-sm font-semibold">
          {dm(weekStart)} – {dm(addDays(weekStart, 6))}/{weekStart.slice(0, 4)}
        </span>
        <div className="inline-flex flex-wrap rounded-lg border p-1">
          <Link href={href({ branch: null })} className={pill(!branchId)}>
            Tất cả kho
          </Link>
          {branchList.map((b) => (
            <Link key={b.id} href={href({ branch: b.id })} className={pill(branchId === b.id)}>
              {b.name}
            </Link>
          ))}
        </div>
        {canSchedule && (
          <div className="ml-auto">
            <CopyWeekButton
              weekStart={weekStart}
              employeeIds={groups.flatMap((g) => g.employees.filter((e) => e.canEdit).map((e) => e.id))}
            />
          </div>
        )}
      </div>

      <ScheduleGrid groups={groups} days={days} shifts={shifts} jobs={gridJobs} />
    </div>
  );
}
