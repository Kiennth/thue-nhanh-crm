"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES, ORDERER_VIEW_ROLES } from "@/lib/roles";

const OrdererSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên không được để trống." }),
  phone: z.string().trim().optional(),
  email: z.string().trim().email({ message: "Email không hợp lệ." }).optional().or(z.literal("")),
  title: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function phoneKey(phone: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

// Sửa hồ sơ người đặt hàng (CEO 2026-10-05).
export async function updateOrderer(
  id: string,
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  await requireRole([...ORDERER_VIEW_ROLES]);
  const parsed = OrdererSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    title: formData.get("title") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const d = parsed.data;
  // orderers chưa có trong types/database.ts (WIP phiên khác) — client không kiểu.
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db
    .from("orderers")
    .update({
      name: d.name,
      phone: d.phone || null,
      phone_key: phoneKey(d.phone),
      email: d.email || null,
      title: d.title || null,
      notes: d.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "SĐT này đã thuộc một người đặt hàng khác." };
    return { error: "Không lưu được: " + error.message };
  }
  revalidatePath("/orderers");
  revalidatePath(`/orderers/${id}`);
  return { success: true };
}

export interface OrdererSuggestion {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
}

// Gợi ý tự điền khi gõ tên / SĐT người đặt trên đơn (CEO 2026-10-05) — mọi
// nhân viên lên đơn đều dùng được (RLS orderers cho đọc).
export async function searchOrderers(q: string): Promise<OrdererSuggestion[]> {
  await requireRole([...ALL_ROLES]);
  const text = q.trim();
  if (text.length < 2) return [];
  const db = (await createClient()) as unknown as SupabaseClient;
  const digits = text.replace(/\D/g, "").replace(/^(84|0)/, "");
  let query = db.from("orderers").select("id, name, phone, email, title").limit(6);
  query =
    digits.length >= 3 && digits.length === text.replace(/[\s.+-]/g, "").replace(/^(84|0)/, "").length
      ? query.ilike("phone_key", `%${digits}%`)
      : query.or(`name.ilike.%${text.replace(/[,()%]/g, " ")}%,email.ilike.%${text.replace(/[,()%]/g, " ")}%`);
  const { data } = await query;
  return (data ?? []) as OrdererSuggestion[];
}
