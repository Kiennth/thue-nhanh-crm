"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES } from "@/lib/roles";
import { VAT_RATE } from "@/lib/order-labels";

export type ActionState = { error: string } | { success: true } | undefined;
export type BulkResult = { orderId: string; orderCode: string; ok: boolean; error?: string }[];

// Cột hoá đơn mới (invoice_needed / invoice_not_needed_reason /
// invoice_draft_at — migration 20261010200000) chưa có trong types.
async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

function revalidateInvoice(orderIds: string[]) {
  revalidatePath("/invoices");
  revalidatePath("/");
  for (const id of orderIds.slice(0, 20)) revalidatePath(`/orders/${id}`);
}

const IssueInvoiceSchema = z.object({
  order_id: z.string().uuid(),
  invoice_number: z.string().trim().min(1, { message: "Vui lòng nhập số hoá đơn." }),
  issued_date: z.string().min(1, { message: "Vui lòng chọn ngày xuất." }),
});

// Sổ hoá đơn đỏ (CEO 2026-09-02): kế toán xác nhận đã xuất hoá đơn cho đơn
// hoàn tất — lưu số HĐ + ngày để đối chiếu cuối kỳ.
export async function markInvoiceIssued(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = IssueInvoiceSchema.safeParse({
    order_id: formData.get("order_id"),
    invoice_number: formData.get("invoice_number"),
    issued_date: formData.get("issued_date"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const { error } = await (await db())
    .from("orders")
    .update({
      invoice_issued_at: `${parsed.data.issued_date}T00:00:00+07:00`,
      invoice_number: parsed.data.invoice_number,
      invoice_not_needed: false,
      invoice_not_needed_reason: null,
    })
    .eq("id", parsed.data.order_id);
  if (error) {
    return { error: "Không ghi được hoá đơn: " + error.message };
  }

  revalidateInvoice([parsed.data.order_id]);
  return { success: true };
}

// Chạy từng đơn, báo kết quả từng đơn (đơn lỗi giữ nguyên trạng thái).
async function bulkUpdate(
  orderIds: string[],
  patch: Record<string, unknown>,
  onlyPending: boolean,
): Promise<BulkResult> {
  const supabase = await db();
  const ids = [...new Set(orderIds)].slice(0, 200);
  const { data: rows } = await supabase
    .from("orders")
    .select("id, order_code, completed_at, cancelled_at, invoice_issued_at, invoice_not_needed")
    .in("id", ids);
  const results: BulkResult = [];
  for (const id of ids) {
    const o = rows?.find((r) => r.id === id);
    if (!o) {
      results.push({ orderId: id, orderCode: "?", ok: false, error: "Không tìm thấy đơn." });
      continue;
    }
    if (onlyPending && (o.cancelled_at || o.invoice_issued_at || o.invoice_not_needed)) {
      results.push({ orderId: id, orderCode: o.order_code, ok: false, error: "Đơn không còn ở trạng thái chờ xuất." });
      continue;
    }
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    results.push({ orderId: id, orderCode: o.order_code, ok: !error, error: error?.message });
  }
  revalidateInvoice(ids);
  return results;
}

// Kế toán đã soạn nháp (trên MISA hoặc sổ tay) — vẫn nằm trong hàng chờ.
export async function markInvoicesDraft(orderIds: string[]): Promise<BulkResult> {
  await requireRole([...MANAGE_ROLES]);
  return bulkUpdate(orderIds, { invoice_draft_at: new Date().toISOString() }, true);
}

// "Không cần" bắt buộc lý do (Grok 10/10 §8.1) — 1 lý do chung khi chọn nhiều.
export async function resetInvoiceStatus(orderId: string) {
  await requireRole([...MANAGE_ROLES]);
  const { error } = await (await db())
    .from("orders")
    .update({
      invoice_issued_at: null,
      invoice_number: null,
      invoice_not_needed: false,
      invoice_not_needed_reason: null,
      invoice_draft_at: null,
    })
    .eq("id", orderId);
  if (error) {
    throw new Error("Không cập nhật được: " + error.message);
  }
  revalidateInvoice([orderId]);
}

// Đơn cần hoá đơn hay không — null = theo khách (Công ty / lấy VAT = cần).
// Chỉ tác dụng lúc đơn hoàn tất (trigger orders_auto_invoice_not_needed).
export async function getInvoiceCopyText(orderId: string): Promise<string> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();
  const [{ data: order }, { data: lines }] = await Promise.all([
    supabase
      .from("orders")
      .select("order_code, total_value, customers(name, tax_code, address, email, invoice_email, contact_name)")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_equipment")
      .select("custom_name, quantity, unit_price, line_total, charge_duration, equipment_types(name, rental_period_unit)")
      .eq("order_id", orderId)
      .order("position"),
  ]);
  if (!order) return "";
  const c = order.customers as unknown as {
    name: string;
    tax_code: string | null;
    address: string | null;
    email: string | null;
    invoice_email: string | null;
  } | null;
  const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}`;
  const vat = Math.round(order.total_value * VAT_RATE);
  const lineText = (lines ?? [])
    .filter((l) => Number(l.line_total) !== 0)
    .map((l, i) => {
      const t = l.equipment_types as unknown as { name: string } | null;
      return `${i + 1}. ${l.custom_name || t?.name || "Hàng"} | SL ${l.quantity} | ${money(Number(l.line_total))}`;
    });
  return [
    `Đơn ${order.order_code}`,
    `Bên mua: ${c?.name ?? ""}`,
    `MST: ${c?.tax_code ?? ""}`,
    `Địa chỉ: ${c?.address ?? ""}`,
    `Email nhận HĐ: ${c?.invoice_email || c?.email || ""}`,
    "",
    ...lineText,
    "",
    `Cộng tiền hàng: ${money(order.total_value)}`,
    `Thuế GTGT ${VAT_RATE * 100}%: ${money(vat)}`,
    `Tổng thanh toán: ${money(order.total_value + vat)}`,
  ].join("\n");
}
