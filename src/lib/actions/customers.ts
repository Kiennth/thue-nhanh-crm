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
    has_existing_tax_code: hasExistingId,
  };
}

// Dựng bản ghi lưu DB từ form đã hợp lệ. tax_code = MST công ty / CCCD cá
// nhân (CEO 09/10: 1 ô); cá nhân để trống (người sửa không xem được số đủ) =
// giữ số cũ.
function buildRow(input: CustomerFormInput, extra: z.infer<typeof ExtraSchema>) {
  const company = input.customer_type === "company";
  const row: Record<string, unknown> = {
    customer_type: input.customer_type,
    name: input.name,
    phone: input.phone.trim() ? normalizePhone(input.phone) : null,
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
  } else if (input.tax_code) {
    row.tax_code = normalizeDigits(input.tax_code);
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
  const { data: current } = await supabase.from("customers").select("customer_type, tax_code").eq("id", id).maybeSingle();
  const input = readInput(formData, current?.customer_type === "individual" && !!current?.tax_code);
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
  revalidatePath("/customers/quality");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

// Báo trùng khi rời ô SĐT / MST / CCCD (B6): trả khách đầu tiên trùng.
export async function findDuplicateCustomer(
  field: "phone" | "tax_code",
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
  const { data } = await supabase.from("customers").select("customer_type, tax_code").eq("id", id).maybeSingle();
  return { missingCccd: !!data && data.customer_type === "individual" && !data.tax_code };
}

// Popup Tạo đơn (Grok CRM 09/10 §C1): chọn khách → tự điền người đặt, SĐT,
// email, địa chỉ giao từ hồ sơ; "người liên hệ khác" = người đặt các đơn gần
// đây của khách (khách agency nhiều nhân sự đặt). Thiếu CCCD chỉ để cảnh báo.
export interface CustomerOrderDefaults {
  missingCccd: boolean;
  depositPercentage: number;
  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;
  deliveryAddress: string;
  contacts: { name: string; phone: string; email: string }[];
}

export async function getCustomerOrderDefaults(id: string): Promise<CustomerOrderDefaults | null> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const [{ data: c }, { data: recent }] = await Promise.all([
    supabase
      .from("customers")
      .select("name, customer_type, tax_code, phone, email, address, contact_name, deposit_percentage")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("orderer_name, orderer_phone, orderer_email, delivery_address")
      .eq("customer_id", id)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (!c) return null;
  const contacts: CustomerOrderDefaults["contacts"] = [];
  const seen = new Set<string>();
  for (const o of recent ?? []) {
    const name = o.orderer_name?.trim();
    if (!name) continue;
    const key = (o.orderer_phone ?? "").replace(/\D/g, "") || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({ name, phone: o.orderer_phone ?? "", email: o.orderer_email ?? "" });
    if (contacts.length >= 6) break;
  }
  const individual = c.customer_type === "individual";
  // Công ty: người liên hệ trong hồ sơ, không có thì người đặt gần nhất.
  // Cá nhân: chính khách.
  const primary = individual
    ? { name: c.name, phone: c.phone ?? "", email: c.email ?? "" }
    : c.contact_name?.trim()
      ? { name: c.contact_name.trim(), phone: c.phone ?? "", email: c.email ?? "" }
      : (contacts[0] ?? { name: "", phone: c.phone ?? "", email: c.email ?? "" });
  const lastAddress = (recent ?? []).find((o) => o.delivery_address?.trim())?.delivery_address ?? "";
  return {
    missingCccd: individual && !c.tax_code,
    depositPercentage: c.deposit_percentage ?? 100,
    ordererName: primary.name,
    ordererPhone: primary.phone || c.phone || "",
    ordererEmail: primary.email || c.email || "",
    deliveryAddress: c.address?.trim() || lastAddress,
    contacts: contacts.filter((x) => x.name !== primary.name || x.phone !== primary.phone),
  };
}

// Tìm khách hàng theo tên/SĐT/MST/email — dùng cho ô chọn khách hàng dạng
// combobox khi tạo/sửa đơn hàng (email thêm 2026-10-01, CEO báo gõ email
// không ra). Không dùng select("*") toàn bộ khách hàng ở đây vì Supabase giới
// hạn 1.000 dòng mỗi query (bảng này hiện có hơn 5.800 dòng).
export async function searchCustomers(
  query: string,
): Promise<{ id: string; name: string; phone: string | null; customer_type: string }[]> {
  await requireRole([...ALL_ROLES]);

  // Bỏ ký tự cú pháp của or= PostgREST (dấu phẩy, ngoặc) để chuỗi tìm không
  // phá filter.
  const trimmed = query.replace(/[,()"\\]/g, " ").trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, customer_type")
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

// Gộp khách trùng (giai đoạn 6, Grok 10/10): chuyển mọi đơn / ghi chú công nợ
// / đơn cũ của khách bị gộp sang khách giữ lại, điền ô trống, xoá khách bị
// gộp (nhật ký hoạt động lưu bản sao). RPC merge_customers tự kiểm quyền.
export async function mergeCustomers(
  keepId: string,
  dropId: string,
): Promise<{ error: string } | { success: true; droppedName: string; moved: Record<string, number> }> {
  await requireRole(["giam_doc", "admin", "ke_toan"]);
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient).rpc(
    "merge_customers",
    { p_keep: keepId, p_drop: dropId },
  );
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/customers/quality");
  revalidatePath(`/customers/${keepId}`);
  const r = data as { droppedName: string; moved: Record<string, number> };
  return { success: true, droppedName: r.droppedName, moved: r.moved ?? {} };
}

// "Không phải trùng": nhóm trùng SĐT / MST đã xác nhận là khách khác nhau
// (vd 2 phòng ban cùng MST — CEO 10/10) → ẩn khỏi Dữ liệu khách cần sửa.
export async function ignoreDuplicateGroup(
  kind: "dup_phone" | "dup_tax",
  key: string,
  note: string,
): Promise<{ error: string } | { success: true }> {
  const employee = await requireRole(["giam_doc", "admin", "ke_toan"]);
  if (!["dup_phone", "dup_tax"].includes(kind) || !/^[0-9-]{9,14}$/.test(key)) return { error: "Nhóm không hợp lệ." };
  const supabase = (await createClient()) as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { error } = await supabase
    .from("customer_dup_ignores")
    .upsert({ kind, key, note: note.trim().slice(0, 300) || null, created_by: employee.id });
  if (error) return { error: error.message };
  revalidatePath("/customers/quality");
  return { success: true };
}
