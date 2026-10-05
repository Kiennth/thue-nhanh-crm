"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import { getSiteUrl } from "@/lib/site-url";

const employeeShape = {
  name: z.string().trim().min(1, { message: "Tên không được để trống." }),
  branch_id: z.string().uuid().optional().or(z.literal("")),
  base_salary: z.coerce.number().min(0, { message: "Lương cứng không được âm." }),
  role: z.enum(["giam_doc", "admin", "ke_toan", "cua_hang_truong", "ky_thuat_sales"]),
  // Ngày sinh — để module Thưởng tự nhắc sinh nhật trong tháng (CEO
  // 2026-08-09). Không bắt buộc.
  birthday: z.string().optional().or(z.literal("")),
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
  await requireRole([...DIRECTOR_ONLY]);

  const parsed = CreateEmployeeSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id") || "",
    base_salary: formData.get("base_salary"),
    role: formData.get("role"),
    birthday: formData.get("birthday") || "",
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, branch_id, birthday, ...rest } = parsed.data;
  const admin = createAdminClient();

  const siteUrl = await getSiteUrl();
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
    birthday: birthday || null,
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
  await requireRole([...DIRECTOR_ONLY]);

  const parsed = UpdateEmployeeSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id") || "",
    base_salary: formData.get("base_salary"),
    role: formData.get("role"),
    birthday: formData.get("birthday") || "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { branch_id, birthday, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ ...rest, branch_id: branch_id || null, birthday: birthday || null })
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật nhân viên: " + error.message };
  }

  revalidatePath("/employees");
  return { success: true };
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  await requireRole([...DIRECTOR_ONLY]);

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

// Hồ sơ nhân viên (CEO 2026-10-05) — bảng employee_profiles (có CCCD) chỉ
// Giám đốc sửa; ngày sinh vẫn nằm ở employees.birthday.
const ProfileSchema = z.object({
  birthday: z.string().optional().or(z.literal("")),
  company_phone: z.string().trim().optional(),
  personal_phone: z.string().trim().optional(),
  emergency_name: z.string().trim().optional(),
  emergency_relation: z.string().trim().optional(),
  emergency_phone: z.string().trim().optional(),
  facebook_url: z.string().trim().optional(),
  citizen_id: z.string().trim().optional(),
  citizen_id_issued_on: z.string().optional().or(z.literal("")),
  citizen_id_issued_place: z.string().trim().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function saveEmployeeProfile(
  employeeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...DIRECTOR_ONLY]);
  if (!z.string().uuid().safeParse(employeeId).success) return { error: "Nhân viên không hợp lệ." };
  const raw: Record<string, string> = {};
  for (const key of Object.keys(ProfileSchema.shape)) raw[key] = String(formData.get(key) ?? "");
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const { birthday, ...profile } = parsed.data;
  const clean = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ? v : null]));
  // Link Facebook gõ thiếu https:// thì tự thêm.
  if (clean.facebook_url && !/^https?:\/\//i.test(clean.facebook_url)) {
    clean.facebook_url = `https://${clean.facebook_url}`;
  }

  const supabase = await createClient();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("employees").update({ birthday: birthday || null }).eq("id", employeeId),
    // employee_profiles chưa có trong types/database.ts — ép kiểu.
    supabase
      .from("employee_profiles" as never)
      .upsert({ employee_id: employeeId, ...clean, updated_at: new Date().toISOString() } as never),
  ]);
  if (e1 || e2) return { error: "Không lưu được hồ sơ: " + (e1 ?? e2)!.message };

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return { success: true };
}
