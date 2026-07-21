"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";

const HR_ROLES = ["admin", "ke_toan"] as const;

const employeeShape = {
  name: z.string().trim().min(1, { message: "Tên không được để trống." }),
  department: z.string().trim().optional(),
  branch_id: z.string().uuid().optional().or(z.literal("")),
  base_salary: z.coerce.number().min(0, { message: "Lương cứng không được âm." }),
  role: z.enum(["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"]),
};

const CreateEmployeeSchema = z.object({
  ...employeeShape,
  email: z.string().trim().email({ message: "Email không hợp lệ." }),
});

const UpdateEmployeeSchema = z.object(employeeShape);

export type ActionState = { error: string } | { success: true } | undefined;

export async function createEmployee(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...HR_ROLES]);

  const parsed = CreateEmployeeSchema.safeParse({
    name: formData.get("name"),
    department: formData.get("department") || undefined,
    branch_id: formData.get("branch_id") || "",
    base_salary: formData.get("base_salary"),
    role: formData.get("role"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, branch_id, ...rest } = parsed.data;
  const admin = createAdminClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${siteUrl}/login` },
  );

  if (inviteError || !invited.user) {
    return { error: "Không thể gửi lời mời: " + (inviteError?.message ?? "lỗi không rõ") };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("employees").insert({
    ...rest,
    email,
    branch_id: branch_id || null,
    user_id: invited.user.id,
  });

  if (insertError) {
    // Rollback tài khoản vừa mời để tránh auth user mồ côi không gắn với employees.
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: "Không thể tạo nhân viên: " + insertError.message };
  }

  revalidatePath("/employees");
  return { success: true };
}

export async function updateEmployee(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...HR_ROLES]);

  const parsed = UpdateEmployeeSchema.safeParse({
    name: formData.get("name"),
    department: formData.get("department") || undefined,
    branch_id: formData.get("branch_id") || "",
    base_salary: formData.get("base_salary"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { branch_id, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ ...rest, branch_id: branch_id || null })
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật nhân viên: " + error.message };
  }

  revalidatePath("/employees");
  return { success: true };
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  await requireRole([...HR_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    throw new Error("Không thể cập nhật trạng thái: " + error.message);
  }

  revalidatePath("/employees");
}
