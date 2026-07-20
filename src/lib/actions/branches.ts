"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

const BranchSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên chi nhánh không được để trống." }),
  min_wage_region: z.string().trim().optional(),
  is_active: z.coerce.boolean(),
});

export type ActionState = { error: string } | { success: true } | undefined;

export async function createBranch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin"]);

  const parsed = BranchSchema.safeParse({
    name: formData.get("name"),
    min_wage_region: formData.get("min_wage_region") || undefined,
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo chi nhánh: " + error.message };
  }

  revalidatePath("/branches");
  return { success: true };
}

export async function updateBranch(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["admin"]);

  const parsed = BranchSchema.safeParse({
    name: formData.get("name"),
    min_wage_region: formData.get("min_wage_region") || undefined,
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("branches").update(parsed.data).eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật chi nhánh: " + error.message };
  }

  revalidatePath("/branches");
  return { success: true };
}

export async function deleteBranch(id: string) {
  await requireRole(["admin"]);

  const supabase = await createClient();
  const { error } = await supabase.from("branches").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá chi nhánh: " + error.message);
  }

  revalidatePath("/branches");
}
