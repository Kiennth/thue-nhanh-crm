import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDailyReminders } from "@/lib/daily-reminders";
import { TestSendButton } from "./test-send-button";

// Xem trước email nhắc việc 17h (CEO 2026-10-04) — nội dung đúng như sẽ gửi
// tối nay cho từng kho, kèm danh sách người nhận.
export default async function RemindersPage() {
  await requireRole([...MANAGE_ROLES]);
  const digests = await buildDailyReminders(createAdminClient() as unknown as SupabaseClient);
  const enabled = process.env.DAILY_REMINDERS_ENABLED === "1";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Email nhắc việc 17h</h1>
        <p className="text-sm text-muted-foreground">
          Mỗi ngày 17h CRM gửi lịch giao / thu hồi ngày mai, đơn quá hạn và mã sắp thiếu cho từng kho.{" "}
          {enabled ? (
            <b className="text-emerald-600">Đang bật gửi.</b>
          ) : (
            <b className="text-amber-600">Chưa bật gửi — đang chờ duyệt bản xem trước.</b>
          )}
        </p>
      </div>
      {digests.map((d) => (
        <Card key={d.branchId ?? "all"}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{d.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Người nhận:{" "}
                {d.recipients.length ? d.recipients.map((r) => `${r.name} (${r.email})`).join(", ") : "chưa có ai có email"}
              </p>
              <p className="text-sm">
                <b>Tiêu đề:</b> {d.empty ? "— ngày mai không có việc, không gửi" : d.subject}
              </p>
            </div>
            {!d.empty && <TestSendButton branchId={d.branchId} />}
          </CardHeader>
          {!d.empty && (
            <CardContent>
              <div
                className="max-h-[480px] overflow-auto rounded-lg border bg-white p-4 text-black"
                dangerouslySetInnerHTML={{ __html: d.html }}
              />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
