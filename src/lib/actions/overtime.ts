"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

const OvertimeEntrySchema = z.object({
  order_id: z.string().uuid().optional(),
  employee_id: z.string().uuid({ message: "Vui lòng chọn nhân viên." }),
  entry_date: z.string().min(1, { message: "Vui lòng chọn ngày." }),
  hours: z.coerce.number().min(0).optional(),
  amount: z.coerce.number().min(0, { message: "Số tiền không được âm." }),
  note: z.string().trim().optional(),
});

export async function addOvertimeEntry(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OvertimeEntrySchema.safeParse({
    order_id: formData.get("order_id") || undefined,
    employee_id: formData.get("employee_id"),
    entry_date: formData.get("entry_date"),
    hours: formData.get("hours") || undefined,
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("overtime_entries").insert(parsed.data);

  if (error) {
    return { error: "Không thể ghi nhận OT: " + error.message };
  }

  if (parsed.data.order_id) {
    revalidatePath(`/orders/${parsed.data.order_id}`);
  }
  return { success: true };
}

export async function deleteOvertimeEntry(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("overtime_entries")
    .select("order_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("overtime_entries").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá OT: " + error.message);
  }

  if (entry?.order_id) {
    revalidatePath(`/orders/${entry.order_id}`);
  }
}
