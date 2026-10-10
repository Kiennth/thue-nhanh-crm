"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";

// View riêng của từng người trên trang Đơn hàng (Grok tách gọn CRM 10/10 giai
// đoạn 2): lưu nguyên chuỗi bộ lọc của URL. RLS saved_views chỉ cho đọc/ghi
// view của chính mình.
const PAGES = { orders: "/orders" } as const;
type SavedViewPage = keyof typeof PAGES;

export async function createSavedView(
  page: SavedViewPage,
  name: string,
  query: string,
): Promise<{ error: string } | { success: true }> {
  const employee = await requireRole([...ALL_ROLES]);
  const clean = name.trim().slice(0, 40);
  if (!clean) return { error: "Đặt tên cho view." };
  // Chỉ giữ tham số lọc, bỏ số trang.
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  params.delete("page");
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase
    .from("saved_views")
    .insert({ employee_id: employee.id, page, name: clean, query: params.toString() });
  if (error) return { error: "Không lưu được view: " + error.message };
  revalidatePath(PAGES[page]);
  return { success: true };
}

export async function deleteSavedView(id: string): Promise<void> {
  await requireRole([...ALL_ROLES]);
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase.from("saved_views").delete().eq("id", id);
  if (error) throw new Error("Không xoá được view: " + error.message);
  revalidatePath("/orders");
}
