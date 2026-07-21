"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

const ALL_ROLES = ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"] as const;

const CustomerSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên khách hàng không được để trống." }),
  phone: z.string().trim().optional(),
  email: z.string().trim().email({ message: "Email không hợp lệ." }).optional().or(z.literal("")),
  notes: z.string().trim().optional(),
  customer_type: z.enum(["individual", "company"]),
  tax_code: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export type ActionState = { error: string } | { success: true } | undefined;

export async function createCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = CustomerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
    customer_type: formData.get("customer_type"),
    tax_code: formData.get("tax_code") || undefined,
    address: formData.get("address") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .insert({ ...rest, email: email || null });

  if (error) {
    return { error: "Không thể tạo khách hàng: " + error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = CustomerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    notes: formData.get("notes") || undefined,
    customer_type: formData.get("customer_type"),
    tax_code: formData.get("tax_code") || undefined,
    address: formData.get("address") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ ...rest, email: email || null })
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật khách hàng: " + error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function deleteCustomer(id: string) {
  await requireRole([...ALL_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá khách hàng: " + error.message);
  }

  revalidatePath("/customers");
}
