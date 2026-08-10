"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";

export type ActionState = { error: string } | { success: true } | undefined;

const DebtNoteSchema = z.object({
  customer_id: z.string().uuid(),
  note: z.string().trim().min(1, { message: "Ghi chú không được để trống." }),
});

// Nhật ký đòi nợ (CEO 2026-08-09) — kế toán ghi lại mỗi lần gọi/khách hẹn
// trả, để người sau mở sổ là biết tình hình, không gọi trùng.
export async function addDebtNote(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employee = await requireRole([...MANAGE_ROLES]);

  const parsed = DebtNoteSchema.safeParse({
    customer_id: formData.get("customer_id"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("debt_notes").insert({
    customer_id: parsed.data.customer_id,
    note: parsed.data.note,
    created_by: employee.id,
  });
  if (error) {
    return { error: "Không thể ghi chú: " + error.message };
  }

  revalidatePath("/debts");
  return { success: true };
}
