import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAT_RATE } from "@/lib/order-labels";

// Ghi 1 giao dịch tiền vào thành thanh toán của đơn (CEO 2026-10-04). Dùng
// chung cho webhook SePay (tự khớp theo nội dung) và nút gán tay ở trang
// /debts/bank. Chia tiền:
//   - nội dung có "COC" → toàn bộ là thu cọc;
//   - không có → trả tiền thuê (gồm VAT) còn thiếu trước, dư thì tính là cọc
//     (khách hay chuyển gộp tiền thuê + ký quỹ 1 lần).
export async function applyBankTransaction(
  db: SupabaseClient,
  opts: {
    transactionId: string;
    orderId: string;
    amount: number;
    paidAt: string; // YYYY-MM-DD giờ VN
    deposit: boolean;
    note: string;
    createdBy: string | null;
  },
): Promise<{ error?: string; invoice: number; deposit: number }> {
  const { data: order } = await db
    .from("orders")
    .select("id, total_value, cancelled_at")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (!order) return { error: "Không tìm thấy đơn.", invoice: 0, deposit: 0 };

  let invoicePart = 0;
  let depositPart = opts.amount;
  if (!opts.deposit) {
    const { data: paid } = await db
      .from("order_payments")
      .select("amount")
      .eq("order_id", opts.orderId)
      .eq("payment_type", "invoice");
    const grand = Math.round(order.total_value * (1 + VAT_RATE) * 100) / 100;
    const paidSum = (paid ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Math.round((grand - paidSum) * 100) / 100);
    // Đơn chưa có giá (0đ) hoặc đã trả đủ: coi cả khoản là tiền thuê nếu
    // không ghi COC — tránh tự biến thành cọc khi đơn chưa lên giá.
    invoicePart = remaining > 0 ? Math.min(opts.amount, remaining) : opts.amount;
    depositPart = Math.round((opts.amount - invoicePart) * 100) / 100;
  }

  const rows = [
    invoicePart > 0 && { payment_type: "invoice", amount: invoicePart },
    depositPart > 0 && { payment_type: "deposit_collect", amount: depositPart },
  ]
    .filter(Boolean)
    .map((r) => ({
      ...(r as { payment_type: string; amount: number }),
      order_id: opts.orderId,
      method: "chuyen_khoan",
      paid_at: opts.paidAt,
      note: opts.note,
      created_by: opts.createdBy,
      bank_transaction_id: opts.transactionId,
    }));

  const { error } = await db.from("order_payments").insert(rows);
  if (error) return { error: error.message, invoice: 0, deposit: 0 };

  await db
    .from("bank_transactions")
    .update({ status: "matched", order_id: opts.orderId })
    .eq("id", opts.transactionId);
  return { invoice: invoicePart, deposit: depositPart };
}
