"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { buildDailyReminders } from "@/lib/daily-reminders";
import { sendEmail } from "@/lib/email";

// "Gửi thử cho tôi" ở trang /reminders — gửi 1 bản (theo kho chọn) tới
// chính email của người bấm, để duyệt trước khi bật gửi cho nhân viên.
export async function sendReminderTest(branchId: string | null): Promise<{ error?: string; to?: string }> {
  const employee = await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const { data: me } = await supabase.from("employees").select("email").eq("id", employee.id).single();
  if (!me?.email) return { error: "Tài khoản của bạn chưa có email trong mục Nhân viên." };
  const digests = await buildDailyReminders(createAdminClient() as unknown as SupabaseClient);
  const d = digests.find((x) => x.branchId === branchId);
  if (!d) return { error: "Không tìm thấy bản nhắc của kho này." };
  const res = await sendEmail({ to: me.email, subject: `[THỬ] ${d.subject}`, html: d.html });
  return res.error ? { error: res.error } : { to: me.email };
}
