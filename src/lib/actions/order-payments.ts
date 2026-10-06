"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/order-labels";
import { ALL_ROLES, MANAGE_ROLES as DELETE_ROLES } from "@/lib/roles";

export type ActionState = { error: string } | { success: true } | undefined;

const ORDER_PAYMENT_TYPE_OPTIONS = ["invoice", "deposit_collect", "deposit_refund"] as const;

const OrderPaymentSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.coerce.number().positive({ message: "Số tiền phải lớn hơn 0." }),
  method: z.enum(PAYMENT_METHOD_OPTIONS),
  payment_type: z.enum(ORDER_PAYMENT_TYPE_OPTIONS).default("invoice"),
  paid_at: z.string().min(1, { message: "Vui lòng chọn ngày thanh toán." }),
  note: z.string().trim().optional(),
});

export async function createOrderPayment(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);

  const parsed = OrderPaymentSchema.safeParse({
    order_id: formData.get("order_id"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    payment_type: formData.get("payment_type") || undefined,
    paid_at: formData.get("paid_at"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { order_id, ...rest } = parsed.data;
  const { error } = await supabase.from("order_payments").insert({
    order_id,
    ...rest,
    created_by: employee.id,
  });

  if (error) {
    return { error: "Không thể ghi nhận thanh toán: " + error.message };
  }

  revalidatePath(`/orders/${order_id}`);
  return { success: true };
}

export async function deleteOrderPayment(id: string) {
  await requireRole([...DELETE_ROLES]);

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("order_payments")
    .select("order_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("order_payments").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá thanh toán: " + error.message);
  }

  if (payment) {
    revalidatePath(`/orders/${payment.order_id}`);
  }
}

// Nút "Thu đủ tiền" (CEO 2026-10-06): 1 bấm ghi phần còn thiếu của tiền thuê
// (gồm VAT) và tiền cọc, cùng phương thức, ngày hôm nay. Số tiền do trang đơn
// tính (cùng công thức hiển thị) — khoản nào đã đủ (≤ 0) thì bỏ qua.
export async function collectAllDue(
  orderId: string,
  method: (typeof PAYMENT_METHOD_OPTIONS)[number],
  invoiceDue: number,
  depositDue: number,
): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);
  if (!z.string().uuid().safeParse(orderId).success) return { error: "Đơn không hợp lệ." };
  if (!PAYMENT_METHOD_OPTIONS.includes(method)) return { error: "Phương thức không hợp lệ." };
  const rows = [
    { payment_type: "invoice" as const, amount: Math.round(invoiceDue) },
    { payment_type: "deposit_collect" as const, amount: Math.round(depositDue) },
  ].filter((r) => r.amount > 0);
  if (!rows.length) return { error: "Đơn đã thu đủ tiền thuê và tiền cọc." };
  const supabase = await createClient();
  const paidAt = new Date().toISOString();
  const { error } = await supabase.from("order_payments").insert(
    rows.map((r) => ({ order_id: orderId, method, paid_at: paidAt, note: "Thu đủ tiền", created_by: employee.id, ...r })),
  );
  if (error) return { error: "Không ghi nhận được thanh toán: " + error.message };
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}
