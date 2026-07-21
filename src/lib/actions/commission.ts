"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

const ADMIN_ONLY = ["admin"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

// ---------------------------------------------------------------------------
// commission_tiers — bậc thang % hoa hồng theo giá trị đơn, riêng từng chi
// nhánh. Chỉ Admin sửa (Kế toán chỉ xem — theo PRD).
// ---------------------------------------------------------------------------

const CommissionTierSchema = z.object({
  branch_id: z.string().uuid(),
  tier_number: z.coerce.number().int().min(1),
  min_value: z.coerce.number().min(0, { message: "Giá trị tối thiểu không được âm." }),
  max_value: z.coerce.number().min(0).optional(),
  percentage: z.coerce
    .number()
    .min(0.01, { message: "% hoa hồng phải lớn hơn 0." })
    .max(100, { message: "% hoa hồng không được vượt quá 100." }),
});

export async function createCommissionTier(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ADMIN_ONLY]);

  const parsed = CommissionTierSchema.safeParse({
    branch_id: formData.get("branch_id"),
    tier_number: formData.get("tier_number"),
    min_value: formData.get("min_value"),
    max_value: formData.get("max_value") || undefined,
    percentage: formData.get("percentage"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("commission_tiers").insert({
    ...parsed.data,
    max_value: parsed.data.max_value ?? null,
  });

  if (error) {
    return { error: "Không thể thêm bậc hoa hồng: " + error.message };
  }

  revalidatePath("/commission");
  return { success: true };
}

export async function deleteCommissionTier(id: string) {
  await requireRole([...ADMIN_ONLY]);

  const supabase = await createClient();
  const { error } = await supabase.from("commission_tiers").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá bậc hoa hồng: " + error.message);
  }

  revalidatePath("/commission");
}

// ---------------------------------------------------------------------------
// bonus_tiers — bậc thưởng theo tổng khoán tháng, riêng từng chi nhánh.
// ---------------------------------------------------------------------------

const BonusTierSchema = z.object({
  branch_id: z.string().uuid(),
  tier_number: z.coerce.number().int().min(1),
  threshold_amount: z.coerce.number().min(0, { message: "Ngưỡng không được âm." }),
  bonus_amount: z.coerce.number().min(0, { message: "Số tiền thưởng không được âm." }),
});

export async function createBonusTier(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ADMIN_ONLY]);

  const parsed = BonusTierSchema.safeParse({
    branch_id: formData.get("branch_id"),
    tier_number: formData.get("tier_number"),
    threshold_amount: formData.get("threshold_amount"),
    bonus_amount: formData.get("bonus_amount"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bonus_tiers").insert(parsed.data);

  if (error) {
    return { error: "Không thể thêm bậc thưởng: " + error.message };
  }

  revalidatePath("/commission");
  return { success: true };
}

export async function deleteBonusTier(id: string) {
  await requireRole([...ADMIN_ONLY]);

  const supabase = await createClient();
  const { error } = await supabase.from("bonus_tiers").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá bậc thưởng: " + error.message);
  }

  revalidatePath("/commission");
}

// ---------------------------------------------------------------------------
// task_weights — tỷ trọng đóng góp 10 khâu tính khoán (dùng chung mọi chi
// nhánh). Luôn có sẵn 10 dòng, chỉ sửa weight_percentage, không thêm/xoá.
// ---------------------------------------------------------------------------

const TaskWeightSchema = z.object({
  weight_percentage: z.coerce
    .number()
    .min(0.01, { message: "Tỷ trọng phải lớn hơn 0." })
    .max(100, { message: "Tỷ trọng không được vượt quá 100." }),
});

export async function updateTaskWeight(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ADMIN_ONLY]);

  const parsed = TaskWeightSchema.safeParse({ weight_percentage: formData.get("weight_percentage") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("task_weights")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật tỷ trọng: " + error.message };
  }

  revalidatePath("/commission");
  return { success: true };
}
