"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/order-labels";

const ALL_ROLES = ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"] as const;
const DELETE_ROLES = ["admin", "ke_toan"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

const OrderPaymentSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.coerce.number().positive({ message: "Số tiền phải lớn hơn 0." }),
  method: z.enum(PAYMENT_METHOD_OPTIONS),
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
