import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDailyReminders } from "@/lib/daily-reminders";
import { sendEmail } from "@/lib/email";

// Gọi bởi cron Cloudflare 17h giờ VN (custom-worker.js → scheduled). Xác
// thực bằng header x-cron-secret = CRON_SECRET; middleware cho qua /api/cron/.
// Chỉ gửi thật khi DAILY_REMINDERS_ENABLED=1 (CEO duyệt bản xem trước ở
// /reminders) — chưa bật thì chỉ trả về số liệu, không gửi.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const digests = await buildDailyReminders(createAdminClient() as unknown as SupabaseClient);
  const enabled = process.env.DAILY_REMINDERS_ENABLED === "1";
  const results: { title: string; sent: number; skipped?: string; errors?: string[] }[] = [];
  for (const d of digests) {
    if (d.empty) {
      results.push({ title: d.title, sent: 0, skipped: "không có việc" });
      continue;
    }
    if (!enabled) {
      results.push({ title: d.title, sent: 0, skipped: "chưa bật gửi" });
      continue;
    }
    const errors: string[] = [];
    let sent = 0;
    for (const r of d.recipients) {
      const res = await sendEmail({ to: r.email, subject: d.subject, html: d.html });
      if (res.error) errors.push(`${r.email}: ${res.error}`);
      else sent += 1;
    }
    results.push({ title: d.title, sent, ...(errors.length ? { errors } : {}) });
  }
  return Response.json({ ok: true, enabled, results });
}
