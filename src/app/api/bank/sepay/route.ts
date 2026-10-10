import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTransferContent } from "@/lib/vietqr";
import { applyBankTransaction } from "@/lib/bank-reconcile";

// Webhook SePay (CEO 2026-10-04): mỗi giao dịch tiền vào tài khoản công ty
// SePay gọi về đây. Xác thực bằng header "Authorization: Apikey <khoá>"
// (khoá = SEPAY_WEBHOOK_KEY, dán vào cấu hình webhook bên SePay). Middleware
// cho qua không cần đăng nhập. Trả 200 {success:true} để SePay không gửi lại.

interface SepayPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string; // "2026-10-04 14:02:37" giờ VN
  accountNumber?: string;
  content?: string;
  description?: string;
  transferType?: "in" | "out";
  transferAmount?: number;
  referenceCode?: string;
}

function ok(extra: Record<string, unknown> = {}) {
  return Response.json({ success: true, ...extra });
}

export async function POST(request: Request) {
  const key = process.env.SEPAY_WEBHOOK_KEY;
  const auth = request.headers.get("authorization") ?? "";
  if (!key || auth.replace(/^Apikey\s+/i, "").trim() !== key) {
    return Response.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: SepayPayload;
  try {
    body = (await request.json()) as SepayPayload;
  } catch {
    return Response.json({ success: false, message: "bad json" }, { status: 400 });
  }
  // Chỉ quan tâm tiền VÀO.
  if (body.transferType !== "in" || !body.transferAmount || body.transferAmount <= 0) return ok({ skipped: true });

  const db = createAdminClient() as unknown as SupabaseClient;
  const content = (body.content || body.description || "").trim();
  const wall = (body.transactionDate ?? "").trim();
  const at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(wall)
    ? new Date(`${wall.replace(" ", "T")}+07:00`)
    : new Date();
  const paidAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(at);

  const { data: inserted, error } = await db
    .from("bank_transactions")
    .insert({
      provider: "sepay",
      provider_id: String(body.id),
      account_number: body.accountNumber ?? null,
      bank: body.gateway ?? null,
      amount: body.transferAmount,
      content,
      reference_code: body.referenceCode ?? null,
      transaction_at: at.toISOString(),
      raw: body,
    })
    .select("id")
    .single();
  if (error) {
    // Trùng id = SePay gửi lại giao dịch đã nhận → coi như xong.
    if (error.code === "23505") return ok({ duplicate: true });
    return Response.json({ success: false, message: error.message }, { status: 500 });
  }

  const parsed = parseTransferContent(content);
  if (!parsed) return ok({ matched: false });
  const { data: order } = await db
    .from("orders")
    .select("id, cancelled_at")
    .in("order_code", [parsed.orderCode, ...parsed.altCodes])
    .limit(1)
    .maybeSingle();
  // Đơn đã huỷ: để chờ người xem (có thể khách chuyển nhầm mã).
  if (!order || order.cancelled_at) return ok({ matched: false });

  const result = await applyBankTransaction(db, {
    transactionId: inserted.id,
    orderId: order.id,
    amount: body.transferAmount,
    paidAt,
    deposit: parsed.deposit,
    note: `Tự ghi từ chuyển khoản ${body.gateway ?? ""} · "${content}"`.slice(0, 500),
    createdBy: null,
  });
  if (result.error) return ok({ matched: false, error: result.error });
  revalidatePath(`/orders/${order.id}`);
  return ok({ matched: true });
}
