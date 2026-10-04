"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";

const CustomerSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên khách hàng không được để trống." }),
  phone: z.string().trim().optional(),
  email: z.string().trim().email({ message: "Email không hợp lệ." }).optional().or(z.literal("")),
  notes: z.string().trim().optional(),
  customer_type: z.enum(["individual", "company"]),
  tax_code: z.string().trim().optional(),
  // Mã số ĐVQHNS — khách là đơn vị có quan hệ ngân sách (CEO 2026-10-04).
  budget_unit_code: z.string().trim().optional(),
  address: z.string().trim().optional(),
  deposit_percentage: z.coerce.number().refine((v) => [0, 50, 100].includes(v), {
    message: "Tỉ lệ tiền cọc chỉ được 0%, 50% hoặc 100%.",
  }),
});

export type ActionState = { error: string } | { success: true; id?: string } | undefined;

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
    budget_unit_code: formData.get("budget_unit_code") || undefined,
    address: formData.get("address") || undefined,
    deposit_percentage: formData.get("deposit_percentage") || 100,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, ...rest } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    // budget_unit_code chưa có trong types/database.ts (WIP phiên khác) — ép kiểu.
    .insert({ ...rest, email: email || null, budget_unit_code: rest.budget_unit_code || null } as never)
    .select("id")
    .single();

  if (error) {
    return { error: "Không thể tạo khách hàng: " + error.message };
  }

  revalidatePath("/customers");
  return { success: true, id: data.id };
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
    budget_unit_code: formData.get("budget_unit_code") || undefined,
    address: formData.get("address") || undefined,
    deposit_percentage: formData.get("deposit_percentage") || 100,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { email, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ ...rest, email: email || null, budget_unit_code: rest.budget_unit_code || null } as never)
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật khách hàng: " + error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// Tìm khách hàng theo tên/SĐT/MST/email — dùng cho ô chọn khách hàng dạng
// combobox khi tạo/sửa đơn hàng (email thêm 2026-10-01, CEO báo gõ email
// không ra). Không dùng select("*") toàn bộ khách hàng ở đây vì Supabase giới
// hạn 1.000 dòng mỗi query (bảng này hiện có hơn 5.800 dòng).
export async function searchCustomers(query: string): Promise<{ id: string; name: string }[]> {
  await requireRole([...ALL_ROLES]);

  // Bỏ ký tự cú pháp của or= PostgREST (dấu phẩy, ngoặc) để chuỗi tìm không
  // phá filter.
  const trimmed = query.replace(/[,()"\\]/g, " ").trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name")
    .or(
      `name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,tax_code.ilike.%${trimmed}%,email.ilike.%${trimmed}%,budget_unit_code.ilike.%${trimmed}%`,
    )
    .order("name")
    .limit(20);

  return data ?? [];
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
