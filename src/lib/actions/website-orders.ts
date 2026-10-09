"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";

// "Đơn web" (CEO 2026-10-04): yêu cầu đặt thuê khách gửi từ giỏ hàng
// thuenhanh.vn — bảng website_orders (migration 20261004100000). Nhân viên
// trực xử lý ở /orders/web: liên hệ → "Lên đơn" (popup Tạo đơn nhanh điền
// sẵn) → yêu cầu tự gắn link đơn CRM.

export type WebOrderStatus = "new" | "contacted" | "converted" | "cancelled";

export interface WebOrderItem {
  slug: string;
  equipment_type_id: string;
  unit_id: string | null;
  name: string;
  variant_label: string | null;
  quantity: number;
  line_estimate: number;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// website_orders chưa có trong types/database.ts (file đó đang có thay đổi dở
// của phiên khác) — truy vấn qua client không ràng kiểu. `import type` bị xoá
// lúc build nên không kéo supabase-js vào Worker.
async function webOrdersTable() {
  const supabase = await createClient();
  return (supabase as unknown as SupabaseClient).from("website_orders");
}

export async function updateWebOrderStatus(
  id: string,
  status: WebOrderStatus,
): Promise<{ error: string } | { success: true }> {
  const employee = await requireRole([...ALL_ROLES]);
  const { error } = await (await webOrdersTable())
    .update({ status, handled_by: employee.id })
    .eq("id", id);
  revalidatePath("/orders/web");
  revalidatePath("/orders");
  return error ? { error: "Không cập nhật được: " + error.message } : { success: true };
}

export async function updateWebOrderNote(
  id: string,
  staffNote: string,
): Promise<{ error: string } | { success: true }> {
  await requireRole([...ALL_ROLES]);
  const { error } = await (await webOrdersTable())
    .update({ staff_note: staffNote.trim() || null })
    .eq("id", id);
  revalidatePath("/orders/web");
  return error ? { error: "Không lưu được ghi chú: " + error.message } : { success: true };
}

// Khách cũ khớp với người gửi: MST trước (chính xác nhất), rồi SĐT (so 9 số
// cuối — CRM lưu lẫn 09xx / +849xx / 849xx).
export async function matchWebOrderCustomers(
  rows: { id: string; tax_code: string; phone: string }[],
): Promise<Record<string, { id: string; name: string } | null>> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const result: Record<string, { id: string; name: string } | null> = {};
  for (const r of rows) {
    result[r.id] = null;
    const tax = digits(r.tax_code);
    if (tax.length >= 9) {
      const { data } = await supabase
        .from("customers")
        .select("id, name, tax_code")
        .ilike("tax_code", `%${tax.slice(0, 10)}%`)
        .limit(5);
      const hit = (data ?? []).find((c) => digits(c.tax_code) === tax);
      if (hit) {
        result[r.id] = { id: hit.id, name: hit.name };
        continue;
      }
    }
    const tail = digits(r.phone).slice(-9);
    if (tail.length === 9) {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone")
        .ilike("phone", `%${tail.slice(0, 3)}%`)
        .limit(200);
      const hit = (data ?? []).find((c) => digits(c.phone).endsWith(tail));
      if (hit) result[r.id] = { id: hit.id, name: hit.name };
    }
  }
  return result;
}

// Tạo khách mới đúng theo thông tin khách tự điền trên web.
export async function createCustomerFromWebOrder(
  webOrderId: string,
): Promise<{ error: string } | { id: string; name: string }> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data: wo } = await (await webOrdersTable())
    .select("customer_type, customer_name, company_name, phone, email, tax_code, address")
    .eq("id", webOrderId)
    .single();
  if (!wo) return { error: "Không tìm thấy đơn web." };
  const { data, error } = await supabase
    .from("customers")
    .insert({
      // Công ty: tên pháp nhân (form web v2); khách lẻ: họ tên.
      name: wo.company_name ?? wo.customer_name,
      phone: wo.phone,
      email: wo.email,
      tax_code: wo.tax_code,
      customer_type: wo.customer_type as "individual" | "company",
      address: wo.address,
      notes: "Tạo từ đơn web",
    })
    .select("id, name")
    .single();
  if (error || !data) return { error: "Không tạo được khách: " + (error?.message ?? "") };
  revalidatePath("/customers");
  return { id: data.id, name: data.name };
}
