import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCalendarFeedToken } from "@/lib/calendar-feed";
import { loadJobs, loadShifts } from "@/lib/work-schedule";
import { JOB_LABELS } from "@/lib/shift-presets";

// Link iCal "Lịch làm việc của tôi" (CEO 2026-10-05): ca trực + việc được
// giao của 1 nhân viên, để đăng ký trên Google Calendar. Middleware cho qua;
// xác thực bằng mã ký (purpose "schedule") + nhân viên còn hoạt động.
const DAY = 86_400_000;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employeeId = await verifyCalendarFeedToken(token, "schedule");
  if (!employeeId) return new Response("Link lịch không hợp lệ.", { status: 404 });
  const db = createAdminClient() as unknown as SupabaseClient;
  const { data: emp } = await db.from("employees").select("id, name, is_active").eq("id", employeeId).maybeSingle();
  if (!emp?.is_active) return new Response("Link lịch không còn hiệu lực.", { status: 404 });

  const now = Date.now();
  const from = new Date(now - 14 * DAY);
  const to = new Date(now + 62 * DAY);
  const [shifts, jobs, branches] = await Promise.all([
    loadShifts(db, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), employeeId),
    loadJobs(db, from.toISOString(), to.toISOString(), employeeId),
    db.from("branches").select("id, name"),
  ]);
  const branchName = new Map(((branches.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const site = new URL(request.url).origin;
  const stamp = ics(new Date(now).toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Thue Nhanh//CRM Schedule//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Thuê Nhanh — Lịch làm việc ${emp.name}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const s of shifts) {
    const where = s.branch_id ? ` · Kho ${branchName.get(s.branch_id) ?? ""}` : "";
    lines.push("BEGIN:VEVENT", `UID:shift-${s.id}@crm.thuenhanh.vn`, `DTSTAMP:${stamp}`);
    if (s.kind === "work" && s.start_time && s.end_time) {
      lines.push(
        `DTSTART:${ics(new Date(`${s.shift_date}T${s.start_time.slice(0, 5)}:00+07:00`).toISOString())}`,
        `DTEND:${ics(new Date(`${s.shift_date}T${s.end_time.slice(0, 5)}:00+07:00`).toISOString())}`,
      );
    } else {
      const next = new Date(Date.parse(`${s.shift_date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${s.shift_date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${next.replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(`🗓 ${s.label}${where}`)}`);
    if (s.note) lines.push(`DESCRIPTION:${esc(s.note)}`);
    lines.push("END:VEVENT");
  }
  for (const j of jobs) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:job-${j.orderId}-${j.kind}-${employeeId}@crm.thuenhanh.vn`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ics(j.at)}`,
      `DTEND:${ics(new Date(Date.parse(j.at) + 60 * 60_000).toISOString())}`,
      `SUMMARY:${esc(`${JOB_LABELS[j.kind]} ${j.orderCode} · ${j.customer}`)}`,
      `DESCRIPTION:${esc([j.address ? `Địa chỉ: ${j.address}` : null, `${site}/orders/${j.orderId}`].filter(Boolean).join("\n"))}`,
      ...(j.address ? [`LOCATION:${esc(j.address)}`] : []),
      `URL:${site}/orders/${j.orderId}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}

function ics(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
