"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES, SUPPLIER_ROLES } from "@/lib/roles";

// Nhà cung cấp (CEO 2026-10-07) — xem migration 20261007140000_suppliers.sql.
const SupplierSchema = z.object({
  supplier_type: z.enum(["company", "individual"]),
  name: z.string().trim().min(1, { message: "Tên nhà cung cấp không được để trống." }),
  contact_name: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim().email({ message: "Email không hợp lệ." }).or(z.literal("")),
  address: z.string().trim(),
  tax_code: z.string().trim(),
  bank_account_number: z.string().trim(),
  bank_name: z.string().trim(),
  bank_account_holder: z.string().trim(),
  products: z.string().trim(),
  notes: z.string().trim(),
  is_active: z.boolean(),
});

export type SupplierActionState = { error: string } | { success: true } | undefined;

function parse(formData: FormData): { ok: false; error: string } | { ok: true; row: Record<string, unknown> } {
  const s = (k: string) => String(formData.get(k) ?? "");
  const parsed = SupplierSchema.safeParse({
    supplier_type: s("supplier_type") || "company",
    name: s("name"),
    contact_name: s("contact_name"),
    phone: s("phone"),
    email: s("email"),
    address: s("address"),
    tax_code: s("tax_code"),
    // Số TK chỉ giữ chữ số (dán từ tin nhắn hay có dấu cách / chấm).
    bank_account_number: s("bank_account_number").replace(/[^\dA-Za-z]/g, ""),
    bank_name: s("bank_name"),
    // Tên chủ TK in hoa không dấu như trên app ngân hàng.
    bank_account_holder: s("bank_account_holder").toUpperCase(),
    products: s("products"),
    notes: s("notes"),
    is_active: formData.get("is_active") !== "off",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  // Ô trống → null.
  const row = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, typeof v === "string" && v === "" ? null : v]),
  );
  return { ok: true, row };
}

async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

export async function createSupplier(formData: FormData): Promise<SupplierActionState> {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const r = parse(formData);
  if (!r.ok) return { error: r.error };
  const { error } = await (await db()).from("suppliers").insert({ ...r.row, created_by: employee.id });
  if (error) return { error: "Không thêm được nhà cung cấp: " + error.message };
  revalidatePath("/suppliers");
  return { success: true };
}

export async function updateSupplier(id: string, formData: FormData): Promise<SupplierActionState> {
  await requireRole([...SUPPLIER_ROLES]);
  const r = parse(formData);
  if (!r.ok) return { error: r.error };
  const { error } = await (await db()).from("suppliers").update(r.row).eq("id", id);
  if (error) return { error: "Không lưu được nhà cung cấp: " + error.message };
  revalidatePath("/suppliers");
  return { success: true };
}

// Ném lỗi thay vì trả về — ConfirmDeleteButton bắt lỗi và hiện toast.
export async function deleteSupplier(id: string): Promise<void> {
  await requireRole([...MANAGE_ROLES]);
  const { error } = await (await db()).from("suppliers").delete().eq("id", id);
  if (error) throw new Error("Không xoá được nhà cung cấp: " + error.message);
  revalidatePath("/suppliers");
}
