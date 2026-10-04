import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCalendarFeedToken } from "@/lib/calendar-feed";
import { loadAgenda, type AgendaItem } from "@/lib/calendar-data";
import type { SupabaseClient } from "@supabase/supabase-js";

// Link iCal "Đăng ký lịch" (CEO 2026-10-04): Google Calendar / iPhone tải
// link này KHÔNG kèm cookie đăng nhập → middleware cho qua, xác thực bằng mã
// ký trong link (lib/calendar-feed.ts) + nhân viên còn hoạt động.

const DAY_MS = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employeeId = await verifyCalendarFeedToken(token);
  if (!employeeId) return new Response("Link lịch không hợp lệ.", { status: 404 });

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, is_active")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee?.is_active) return new Response("Link lịch không còn hiệu lực.", { status: 404 });

  const branchParam = new URL(request.url).searchParams.get("branch");
  const branchId = branchParam && UUID_RE.test(branchParam) ? branchParam : null;
  const now = Date.now();
  const items = await loadAgenda(
    new Date(now - 14 * DAY_MS).toISOString(),
    new Date(now + 92 * DAY_MS).toISOString(),
    branchId,
    admin as unknown as SupabaseClient,
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.thuenhanh.vn";
  const stamp = icsDate(new Date(now).toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Thue Nhanh//CRM Calendar//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Thuê Nhanh — Giao / Thu hồi",
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...items.flatMap((it) => event(it, stamp, siteUrl)),
    "END:VCALENDAR",
  ];

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="thuenhanh-lich.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}

function event(it: AgendaItem, stamp: string, siteUrl: string): string[] {
  const start = icsDate(it.at);
  const end = icsDate(new Date(Date.parse(it.at) + 30 * 60_000).toISOString());
  const verb = it.kind === "delivery" ? "Giao" : "Thu hồi";
  const how =
    it.transport === "bike"
      ? "xe máy"
      : it.transport === "car"
        ? "ô tô"
        : it.kind === "delivery"
          ? "khách tự lấy"
          : "khách tự trả";
  const description = [
    `${it.orderCode} — ${it.customer}${it.phone ? ` (${it.phone})` : ""}`,
    `Cách ${verb.toLowerCase()}: ${how}`,
    it.address ? `Địa chỉ: ${it.address}` : null,
    it.items.length ? `Hàng: ${it.items.join(", ")}` : null,
    it.done ? `Đã ${verb.toLowerCase()} ✓` : null,
    `${siteUrl}/orders/${it.orderId}`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:${it.orderId}-${it.kind}@crm.thuenhanh.vn`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(`${it.done ? "✓ " : ""}${verb} ${it.orderCode} · ${it.customer}`)}`,
    `DESCRIPTION:${escape(description)}`,
    ...(it.address ? [`LOCATION:${escape(it.address)}`] : []),
    `URL:${siteUrl}/orders/${it.orderId}`,
    "END:VEVENT",
  ];
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: dòng tối đa 75 byte, dòng tiếp bắt đầu bằng 1 dấu cách.
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (enc.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
