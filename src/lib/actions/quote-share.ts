"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { quoteShareToken, recordQuoteAcceptance, verifyQuoteShareToken } from "@/lib/quote-share";
import { sendEmail } from "@/lib/email";

const vnd = new Intl.NumberFormat("vi-VN");

// Đường dẫn ngắn gửi khách (nhân viên bấm "Link báo giá" ở trang đơn).
export async function getQuoteSharePath(orderId: string): Promise<{ path?: string; error?: string }> {
  await requireRole([...ALL_ROLES]);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return { error: "Đơn không hợp lệ." };
  return { path: `/q/${await quoteShareToken(orderId)}` };
}

// KHÔNG cần đăng nhập — khách bấm Đồng ý trên link báo giá. Chỉ chạy được
// khi mã ký trong link đúng với đơn.
export async function acceptQuote(token: string, name: string): Promise<{ error?: string; already?: boolean }> {
  const orderId = await verifyQuoteShareToken(token);
  if (!orderId) return { error: "Link báo giá không hợp lệ." };
  const cleanName = name.trim().slice(0, 120);
  if (cleanName.length < 2) return { error: "Vui lòng nhập họ tên người xác nhận." };

  const db = createAdminClient() as unknown as SupabaseClient;
  const result = await recordQuoteAcceptance(db, orderId, cleanName);
  if (result.error) return { error: result.error };
  if (result.already) return { already: true };

  // Báo Giám đốc + người phụ trách (người làm khâu Báo giá / tạo đơn).
  const { data: people } = await db
    .from("employees")
    .select("id, email, role")
    .eq("is_active", true)
    .or(`role.eq.giam_doc${result.employeeId ? `,id.eq.${result.employeeId}` : ""}`);
  const { data: order } = await db.from("orders").select("customers(name)").eq("id", orderId).maybeSingle();
  const customer = (order as unknown as { customers: { name: string } | null } | null)?.customers?.name ?? "";
  const emails = [...new Set((people ?? []).map((p: { email: string | null }) => p.email).filter(Boolean))] as string[];
  const link = `https://crm.thuenhanh.vn/orders/${orderId}`;
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `✅ Khách đồng ý báo giá ${result.orderCode} — ${customer}`,
      html: `<div style="font-family:Arial,sans-serif"><p><b>${cleanName}</b> (${customer}) vừa bấm <b>Đồng ý</b> báo giá đơn <a href="${link}">${result.orderCode}</a>, tổng ${vnd.format(result.total ?? 0)}đ (gồm VAT).</p><p>CRM đã tự hoàn thành khâu Chốt đơn. Bước tiếp: ký hợp đồng &amp; thu cọc.</p></div>`,
    });
  }
  revalidatePath(`/orders/${orderId}`);
  return {};
}
