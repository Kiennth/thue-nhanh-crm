import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAT_RATE, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import { vnTodayString } from "@/lib/vn-time";

// Link báo giá gửi khách (CEO 2026-10-04): /q/<orderId>.<mã ký> — khách xem
// báo giá + bấm Đồng ý không cần đăng nhập. Mã ký HMAC theo đơn (dùng chung
// khoá CALENDAR_FEED_SECRET, khác tiền tố) nên đoán được id đơn cũng không
// mở được báo giá đơn khác.

async function sign(orderId: string): Promise<string> {
  const secret = process.env.CALENDAR_FEED_SECRET;
  if (!secret) throw new Error("Thiếu CALENDAR_FEED_SECRET.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`quote:${orderId}`));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 24);
}

export async function quoteShareToken(orderId: string): Promise<string> {
  return `${orderId}.${await sign(orderId)}`;
}

export async function verifyQuoteShareToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [orderId, sig] = token.split(".");
  if (!orderId || !sig || !/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const expected = await sign(orderId);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? orderId : null;
}

// Khách bấm Đồng ý: lưu người/lúc/tổng tiền, hoàn thành Tiếp nhận → Báo giá
// → Chốt đơn (khâu còn thiếu) cho người đã làm khâu Báo giá (không có thì
// người tạo đơn) — khoán khâu Chốt đơn về đúng người gửi báo giá.
export async function recordQuoteAcceptance(
  db: SupabaseClient,
  orderId: string,
  name: string,
): Promise<{ error?: string; already?: boolean; orderCode?: string; employeeId?: string | null; total?: number }> {
  const { data: order } = await db
    .from("orders")
    .select("id, order_code, total_value, cancelled_at, created_by, quote_accepted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Không tìm thấy đơn." };
  if (order.cancelled_at) return { error: "Đơn này đã huỷ — vui lòng liên hệ Thuê Nhanh." };
  if (order.quote_accepted_at) return { already: true, orderCode: order.order_code };

  const total = Math.round(Number(order.total_value) * (1 + VAT_RATE) * 100) / 100;
  const { error } = await db
    .from("orders")
    .update({ quote_accepted_at: new Date().toISOString(), quote_accepted_name: name, quote_accepted_total: total })
    .eq("id", orderId)
    .is("quote_accepted_at", null);
  if (error) return { error: "Không lưu được: " + error.message };

  const { data: tasks } = await db
    .from("order_tasks")
    .select("task_type, employee_id, completed_date")
    .eq("order_id", orderId);
  const quoteTask = (tasks ?? []).find((t: { task_type: string }) => t.task_type === "bao_gia");
  const employeeId: string | null = quoteTask?.employee_id ?? order.created_by ?? null;
  if (employeeId) {
    const done = new Set(
      (tasks ?? [])
        .filter((t: { completed_date: string | null }) => t.completed_date)
        .map((t: { task_type: string }) => t.task_type),
    );
    const stages = TASK_TYPE_SEQUENCE.slice(0, TASK_TYPE_SEQUENCE.indexOf("chot_don") + 1);
    for (const stage of stages) {
      if (done.has(stage)) continue;
      await db.from("order_tasks").upsert(
        { order_id: orderId, task_type: stage, employee_id: employeeId, completed_date: vnTodayString() },
        { onConflict: "order_id,task_type" },
      );
    }
  }
  return { orderCode: order.order_code, employeeId, total };
}
