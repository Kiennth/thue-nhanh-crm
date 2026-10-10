"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { applyBankTransaction } from "@/lib/bank-reconcile";

type ActionState = { error: string } | { success: true; message?: string };

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// Gán tay giao dịch ngân hàng chưa khớp vào 1 đơn (trang /debts/bank).
export async function assignBankTransaction(
  transactionId: string,
  orderCode: string,
  depositOnly: boolean,
): Promise<ActionState> {
  const employee = await requireRole([...MANAGE_ROLES]);
  // bank_transactions/order_payments.bank_transaction_id chưa có trong
  // types/database.ts (WIP phiên khác) — dùng client không kiểu.
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: tx } = await db
    .from("bank_transactions")
    .select("id, amount, content, bank, transaction_at, status")
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx) return { error: "Không tìm thấy giao dịch." };
  if (tx.status === "matched") return { error: "Giao dịch này đã ghi vào đơn rồi." };

  const code = orderCode.trim().toUpperCase();
  // Mã chỉ có số (đơn mới từ 10/10) hoặc PO + số (đơn cũ) — gõ kiểu nào cũng
  // tìm được, cùng 1 dãy số nên không trùng.
  const digits = /^(PO)?(\d{5,7})$/.exec(code)?.[2];
  const { data: order } = await db
    .from("orders")
    .select("id, order_code")
    .in("order_code", digits ? [digits, `PO${digits}`] : [code])
    .limit(1)
    .maybeSingle();
  if (!order) return { error: `Không có đơn mã "${code}".` };

  const paidAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(tx.transaction_at),
  );
  const result = await applyBankTransaction(db, {
    transactionId: tx.id,
    orderId: order.id,
    amount: Number(tx.amount),
    paidAt,
    deposit: depositOnly,
    note: `Gán tay từ chuyển khoản ${tx.bank ?? ""} · "${tx.content ?? ""}"`.slice(0, 500),
    createdBy: employee.id,
  });
  if (result.error) return { error: "Không ghi được thanh toán: " + result.error };

  revalidatePath("/debts/bank");
  revalidatePath(`/orders/${order.id}`);
  const parts = [
    result.invoice > 0 && `tiền thuê ${vnd.format(result.invoice)}đ`,
    result.deposit > 0 && `cọc ${vnd.format(result.deposit)}đ`,
  ].filter(Boolean);
  return { success: true, message: `Đã ghi vào ${order.order_code}: ${parts.join(" + ")}` };
}

export async function setBankTransactionIgnored(transactionId: string, ignored: boolean): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db
    .from("bank_transactions")
    .update({ status: ignored ? "ignored" : "unmatched" })
    .eq("id", transactionId)
    .neq("status", "matched");
  if (error) return { error: error.message };
  revalidatePath("/debts/bank");
  return { success: true };
}
