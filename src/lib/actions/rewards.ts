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
  category: z.enum(["bat_chot", "doanh_so", "dinh_ky", "tet", "sinh_nhat", "khac"], {
    message: "Vui lòng chọn loại thưởng.",
  }),
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
    category: formData.get("category"),
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
      category: parsed.data.category,
      created_by: director.id,
    })),
  );
  if (error) {
    return { error: "Không thể ghi nhận thưởng: " + error.message };
  }

  revalidatePath("/rewards");
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
  revalidatePath("/rewards");
  revalidatePath("/payroll");
}

// ---------------------------------------------------------------------
// Qui tắc thưởng (giai đoạn 2, CEO 2026-08-09) — doanh_so: đạt mốc doanh
// số tháng thì GỢI Ý trao; dinh_ky: khoản lặp áp 1 chạm mỗi tháng. Cả 2
// đều cần Giám đốc bấm mới thành tiền — cố ý không tự động.
// ---------------------------------------------------------------------

const RewardRuleSchema = z
  .object({
    rule_type: z.enum(["doanh_so", "dinh_ky"], { message: "Loại qui tắc không hợp lệ." }),
    label: z.string().trim().min(1, { message: "Vui lòng đặt tên qui tắc." }),
    amount: z.coerce.number().positive({ message: "Số tiền thưởng phải lớn hơn 0." }),
    threshold_amount: z.coerce
      .number()
      .positive({ message: "Mốc doanh số phải lớn hơn 0." })
      .optional(),
    // "all" = cả công ty.
    employee_id: z.string().min(1, { message: "Vui lòng chọn người nhận." }),
  })
  .refine((data) => data.rule_type !== "doanh_so" || data.threshold_amount != null, {
    message: "Qui tắc doanh số cần có mốc doanh số.",
  });

export async function addRewardRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...DIRECTOR_ONLY]);

  const parsed = RewardRuleSchema.safeParse({
    rule_type: formData.get("rule_type"),
    label: formData.get("label"),
    amount: formData.get("amount"),
    threshold_amount: formData.get("threshold_amount") || undefined,
    employee_id: formData.get("employee_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reward_rules").insert({
    rule_type: parsed.data.rule_type,
    label: parsed.data.label,
    amount: parsed.data.amount,
    threshold_amount: parsed.data.rule_type === "doanh_so" ? parsed.data.threshold_amount : null,
    employee_id: parsed.data.employee_id === "all" ? null : parsed.data.employee_id,
  });
  if (error) {
    return { error: "Không thể tạo qui tắc: " + error.message };
  }

  revalidatePath("/rewards");
  return { success: true };
}

export async function deleteRewardRule(id: string) {
  await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  // Khoản đã trao từ qui tắc này giữ nguyên trong sổ (rule_id tự về null
  // qua on delete set null) — chỉ qui tắc biến mất.
  const { error } = await supabase.from("reward_rules").delete().eq("id", id);
  if (error) {
    throw new Error("Không thể xoá qui tắc: " + error.message);
  }
  revalidatePath("/rewards");
}

// Áp qui tắc cho 1 tháng: chặn áp trùng (đã có entry của rule trong tháng),
// người nhận chốt tại thời điểm áp (rule cả công ty = mọi nhân viên đang
// hoạt động lúc bấm).
export async function applyRewardRule(ruleId: string, month: string): Promise<ActionState> {
  const director = await requireRole([...DIRECTOR_ONLY]);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: "Tháng không hợp lệ." };
  }
  const [yearStr, monthStr] = month.split("-");
  const rangeStart = `${month}-01`;
  const rangeEnd =
    Number(monthStr) === 12
      ? `${Number(yearStr) + 1}-01-01`
      : `${yearStr}-${String(Number(monthStr) + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();
  const { data: rule, error: ruleError } = await supabase
    .from("reward_rules")
    .select("id, rule_type, label, amount, threshold_amount, employee_id, is_active")
    .eq("id", ruleId)
    .single();
  if (ruleError || !rule) {
    return { error: "Không tìm thấy qui tắc." };
  }
  if (!rule.is_active) {
    return { error: "Qui tắc đang tắt." };
  }

  const { count: existing } = await supabase
    .from("reward_entries")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", ruleId)
    .gte("entry_date", rangeStart)
    .lt("entry_date", rangeEnd);
  if ((existing ?? 0) > 0) {
    return { error: `Qui tắc "${rule.label}" đã áp cho tháng ${monthStr}/${yearStr} rồi.` };
  }

  let recipientIds: string[];
  if (rule.employee_id) {
    recipientIds = [rule.employee_id];
  } else {
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id")
      .eq("is_active", true);
    if (error || !employees?.length) {
      return { error: "Không lấy được danh sách nhân viên." };
    }
    recipientIds = employees.map((e) => e.id);
  }

  // Tiền rơi vào đúng tháng được áp: tháng hiện tại ghi ngày hôm nay,
  // tháng khác (áp bù) ghi ngày đầu tháng đó.
  const today = new Date().toISOString().slice(0, 10);
  const entryDate = today.startsWith(month) ? today : rangeStart;

  const { error: insertError } = await supabase.from("reward_entries").insert(
    recipientIds.map((employeeId) => ({
      employee_id: employeeId,
      entry_date: entryDate,
      amount: rule.amount,
      reason: `${rule.label} — tháng ${monthStr}/${yearStr}`,
      category: rule.rule_type,
      rule_id: rule.id,
      created_by: director.id,
    })),
  );
  if (insertError) {
    return { error: "Không thể áp qui tắc: " + insertError.message };
  }

  revalidatePath("/rewards");
  revalidatePath("/payroll");
  return { success: true };
}
