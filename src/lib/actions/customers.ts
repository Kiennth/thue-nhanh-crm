"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import type { Database } from "@/types/database";
import {
  normalizeDigits,
  normalizePhone,
  validateCustomer,
  type CustomerFormInput,
} from "@/lib/customer-validation";

// B6 (Grok CRM 09/10): form khách tách Công ty / Cá nhân. Kiểm tra chung ở
// lib/customer-validation.ts (form dùng cùng hàm để báo lỗi khi rời ô).
const ExtraSchema = z.object({
  notes: z.string().trim().optional(),
  // Mã số ĐVQHNS — khách là đơn vị có quan hệ ngân sách (CEO 2026-10-04).
  budget_unit_code: z.string().trim().optional(),
  // Thông tin hợp đồng (CEO 2026-10-04) — điền vào phần BÊN B của chứng từ.
  representative_name: z.string().trim().optional(),
  representative_title: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  address: z.string().trim().optional(),
  deposit_percentage: z.coerce.number().refine((v) => [0, 50, 100].includes(v), {
    message: "Tỉ lệ tiền cọc chỉ được 0%, 50% hoặc 100%.",
  }),
});

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function readInput(formData: FormData, hasExistingId: boolean): CustomerFormInput {
  return {
    customer_type: formData.get("customer_type") === "individual" ? "individual" : "company",
    name: str(formData, "name"),
    phone: str(formData, "phone"),
    email: str(formData, "email"),
    contact_name: str(formData, "contact_name"),
    tax_code: str(formData, "tax_code"),
    wants_vat: formData.get("wants_vat") === "on" || formData.get("wants_vat") === "true",
    invoice_email: str(formData, "invoice_email"),
    id_number: str(formData, "id_number"),
    has_existing_id_number: hasExistingId,
  };
}

// Dựng bản ghi lưu DB từ form đã hợp lệ. Cá nhân: không đụng tax_code (một
// số khách cá nhân là hộ kinh doanh có MST); công ty: không đụng id_number.
function buildRow(input: CustomerFormInput, extra: z.infer<typeof ExtraSchema>) {
  const company = input.customer_type === "company";
  const row: Record<string, unknown> = {
    customer_type: input.customer_type,
    name: input.name,
    phone: normalizePhone(input.phone),
    email: input.email || null,
    notes: extra.notes || null,
    address: extra.address || null,
    deposit_percentage: extra.deposit_percentage,
    // Lưu được = đã rà xong theo mẫu mới.
    needs_review: false,
  };
  if (company) {
    row.contact_name = input.contact_name || null;
    row.wants_vat = input.wants_vat;
    row.tax_code = input.tax_code ? normalizeDigits(input.tax_code) : null;
    row.invoice_email = input.invoice_email || null;
    row.representative_name = extra.representative_name || null;
    row.representative_title = extra.representative_title || null;
    row.budget_unit_code = extra.budget_unit_code || null;
    row.bank_account_number = extra.bank_account_number || null;
    row.bank_name = extra.bank_name || null;
  } else if (input.id_number) {
    row.id_number = normalizeDigits(input.id_number);
  }
  return row;
}

function readExtra(formData: FormData) {
  return ExtraSchema.safeParse({
    notes: formData.get("notes") || undefined,
    budget_unit_code: formData.get("budget_unit_code") || undefined,
    representative_name: formData.get("representative_name") || undefined,
    representative_title: formData.get("representative_title") || undefined,
    bank_account_number: formData.get("bank_account_number") || undefined,
    bank_name: formData.get("bank_name") || undefined,
    address: formData.get("address") || undefined,
    deposit_percentage: formData.get("deposit_percentage") || 100,
  });
}

export type ActionState = { error: string } | { success: true; id?: string } | undefined;

export async function createCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const input = readInput(formData, false);
  const errors = validateCustomer(input);
  const first = Object.values(errors)[0];
  if (first) return { error: first };
  const extra = readExtra(formData);
  if (!extra.success) return { error: extra.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(buildRow(input, extra.data) as Database["public"]["Tables"]["customers"]["Insert"])
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

  const supabase = await createClient();
  const { data: current } = await supabase.from("customers").select("id_number").eq("id", id).maybeSingle();
  const input = readInput(formData, !!current?.id_number);
  const errors = validateCustomer(input);
  const first = Object.values(errors)[0];
  if (first) return { error: first };
  const extra = readExtra(formData);
  if (!extra.success) return { error: extra.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };

  const { error } = await supabase
    .from("customers")
    .update(buildRow(input, extra.data) as Database["public"]["Tables"]["customers"]["Update"])
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật khách hàng: " + error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

// Báo trùng khi rời ô SĐT / MST / CCCD (B6): trả khách đầu tiên trùng.
export async function findDuplicateCustomer(
  field: "phone" | "tax_code" | "id_number",
  value: string,
  excludeId?: string | null,
): Promise<{ id: string; name: string } | null> {
  await requireRole([...ALL_ROLES]);
  const v = field === "phone" ? normalizePhone(value) : normalizeDigits(value);
  if (v.length < 9) return null;
  const supabase = await createClient();
  let q = supabase.from("customers").select("id, name").eq(field, v).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data?.[0] ?? null;
}

// Cảnh báo "Khách chưa có CCCD" khi tạo/chốt đơn (B6 — chỉ cảnh báo, không
// bao giờ chặn đơn).
export async function getCustomerIdStatus(id: string): Promise<{ missingCccd: boolean }> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("customer_type, id_number").eq("id", id).maybeSingle();
  return { missingCccd: !!data && data.customer_type === "individual" && !data.id_number };
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
      `name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,tax_code.ilike.%${trimmed}%,id_number.ilike.%${trimmed}%,email.ilike.%${trimmed}%,budget_unit_code.ilike.%${trimmed}%`,
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
