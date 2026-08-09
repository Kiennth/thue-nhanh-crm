"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";

export type ActionState = { error: string } | { success: true } | undefined;

// Thưởng đột xuất (CEO 2026-08-09): chỉ Giám đốc tạo/xoá — RLS cũng chặn
// đúng như vậy (reward_entries_insert_giam_doc). "Cả công ty" = 1 dòng cho
// TỪNG nhân viên đang hoạt động với cùng số tiền + lý do — ai nhận bao
// nhiêu rõ ràng trong sổ, nhân viên vào sau không tự hưởng khoản cũ.
const RewardSchema = z.object({
  // "all" = thưởng cả công ty; còn lại là employee_id cụ thể.
  employee_id: z.string().min(1, { message: "Vui lòng chọn người nhận." }),
  entry_date: z.string().min(1, { message: "Vui lòng chọn ngày." }),
  amount: z.coerce.number().positive({ message: "Số tiền phải lớn hơn 0." }),
  reason: z.string().trim().min(1, { message: "Vui lòng ghi lý do thưởng — khoản này cần được ghi chép lại." }),
});

export async function addReward(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const director = await requireRole([...DIRECTOR_ONLY]);

  const parsed = RewardSchema.safeParse({
    employee_id: formData.get("employee_id"),
    entry_date: formData.get("entry_date"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  let recipientIds: string[];
  if (parsed.data.employee_id === "all") {
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id")
      .eq("is_active", true);
    if (error || !employees?.length) {
      return { error: "Không lấy được danh sách nhân viên." };
    }
    recipientIds = employees.map((e) => e.id);
  } else {
    recipientIds = [parsed.data.employee_id];
  }

  const { error } = await supabase.from("reward_entries").insert(
    recipientIds.map((employeeId) => ({
      employee_id: employeeId,
      entry_date: parsed.data.entry_date,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      created_by: director.id,
    })),
  );
  if (error) {
    return { error: "Không thể ghi nhận thưởng: " + error.message };
  }

  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteReward(id: string) {
  await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const { error } = await supabase.from("reward_entries").delete().eq("id", id);
  if (error) {
    throw new Error("Không thể xoá khoản thưởng: " + error.message);
  }
  revalidatePath("/payroll");
}
