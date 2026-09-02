"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";

export type ActionState = { error: string } | { success: true } | undefined;

const IssueInvoiceSchema = z.object({
  order_id: z.string().uuid(),
  invoice_number: z.string().trim().min(1, { message: "Vui lòng nhập số hoá đơn." }),
  issued_date: z.string().min(1, { message: "Vui lòng chọn ngày xuất." }),
});

// Sổ hoá đơn đỏ (CEO 2026-09-02): kế toán xác nhận đã xuất hoá đơn cho đơn
// hoàn tất — lưu số HĐ + ngày để đối chiếu cuối kỳ.
export async function markInvoiceIssued(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = IssueInvoiceSchema.safeParse({
    order_id: formData.get("order_id"),
    invoice_number: formData.get("invoice_number"),
    issued_date: formData.get("issued_date"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({
      invoice_issued_at: `${parsed.data.issued_date}T00:00:00+07:00`,
      invoice_number: parsed.data.invoice_number,
      invoice_not_needed: false,
    })
    .eq("id", parsed.data.order_id);
  if (error) {
    return { error: "Không ghi được hoá đơn: " + error.message };
  }

  revalidatePath("/invoices");
  return { success: true };
}

// Khách lẻ không lấy hoá đơn — bỏ khỏi danh sách chờ cho sạch việc.
export async function markInvoiceNotNeeded(orderId: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ invoice_not_needed: true })
    .eq("id", orderId);
  if (error) {
    throw new Error("Không cập nhật được: " + error.message);
  }
  revalidatePath("/invoices");
}

// Đưa đơn quay lại danh sách chờ (bấm nhầm, hoặc cần xuất bù đơn cũ).
export async function resetInvoiceStatus(orderId: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ invoice_issued_at: null, invoice_number: null, invoice_not_needed: false })
    .eq("id", orderId);
  if (error) {
    throw new Error("Không cập nhật được: " + error.message);
  }
  revalidatePath("/invoices");
}
