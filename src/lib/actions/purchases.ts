"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { MANAGE_ROLES, SUPPLIER_ROLES } from "@/lib/roles";
import { vnTodayString } from "@/lib/vn-time";

// Mua hàng từ NCC (CEO 2026-10-07) — xem migration 20261007150000_purchase_orders.sql.
// Phiếu: Nháp → Đã đặt → Đã nhập kho (hoặc Huỷ). Nhập kho chạy RPC
// receive_purchase_order (1 giao dịch: tạo máy serial / cộng tồn số lượng).

type Result<T = undefined> = { error: string } | ({ success: true } & (T extends undefined ? object : T));

async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

function refresh(id?: string) {
  revalidatePath("/purchases");
  if (id) revalidatePath(`/purchases/${id}`);
  revalidatePath("/suppliers");
}

async function editablePo(supabase: SupabaseClient, id: string): Promise<{ error: string } | { status: string }> {
  const { data } = await supabase.from("purchase_orders").select("status").eq("id", id).maybeSingle();
  if (!data) return { error: "Không tìm thấy phiếu mua." };
  if (data.status === "received") return { error: "Phiếu đã nhập kho — không sửa dòng hàng được nữa." };
  if (data.status === "cancelled") return { error: "Phiếu đã huỷ." };
  return { status: data.status as string };
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  branchId: string;
  orderDate: string;
  supplierInvoiceNo?: string;
  note?: string;
}): Promise<Result<{ id: string }>> {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  if (!input.supplierId) return { error: "Chọn nhà cung cấp." };
  if (!input.branchId) return { error: "Chọn kho nhận hàng." };
  if (employee.role === "cua_hang_truong" && input.branchId !== employee.branch_id) {
    return { error: "Cửa hàng trưởng chỉ tạo phiếu nhập về kho của mình." };
  }
  const { data, error } = await (await db())
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplierId,
      branch_id: input.branchId,
      order_date: input.orderDate || vnTodayString(),
      supplier_invoice_no: input.supplierInvoiceNo?.trim() || null,
      note: input.note?.trim() || null,
      created_by: employee.id,
    })
    .select("id")
    .single();
  if (error) return { error: "Không tạo được phiếu mua: " + error.message };
  refresh();
  return { success: true, id: data.id as string };
}

export async function updatePurchaseHeader(
  id: string,
  input: { supplierId?: string; branchId?: string; orderDate?: string; supplierInvoiceNo?: string; note?: string },
): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const { data: po } = await supabase.from("purchase_orders").select("status").eq("id", id).maybeSingle();
  if (!po) return { error: "Không tìm thấy phiếu mua." };
  const patch: Record<string, unknown> = {};
  // Số hoá đơn NCC + ghi chú sửa được cả sau khi nhập kho (hoá đơn hay về sau).
  if (input.supplierInvoiceNo !== undefined) patch.supplier_invoice_no = input.supplierInvoiceNo.trim() || null;
  if (input.note !== undefined) patch.note = input.note.trim() || null;
  const locked = po.status === "received" || po.status === "cancelled";
  if (!locked) {
    if (input.supplierId) patch.supplier_id = input.supplierId;
    if (input.branchId) patch.branch_id = input.branchId;
    if (input.orderDate) patch.order_date = input.orderDate;
  }
  const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
  if (error) return { error: "Không lưu được phiếu: " + error.message };
  refresh(id);
  return { success: true };
}

export async function addPurchaseLine(
  poId: string,
  input: { typeId: string; unitId: string | null; quantity: number; unitCost: number },
): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const ok = await editablePo(supabase, poId);
  if ("error" in ok) return ok;
  if (!(input.quantity > 0)) return { error: "Số lượng phải lớn hơn 0." };
  const { count } = await supabase
    .from("purchase_order_lines")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", poId);
  const { error } = await supabase.from("purchase_order_lines").insert({
    purchase_order_id: poId,
    equipment_type_id: input.typeId,
    equipment_unit_id: input.unitId,
    quantity: Math.round(input.quantity),
    unit_cost: Math.max(0, Math.round(input.unitCost || 0)),
    position: count ?? 0,
  });
  if (error) return { error: "Không thêm được dòng hàng: " + error.message };
  refresh(poId);
  return { success: true };
}

export async function updatePurchaseLine(
  lineId: string,
  input: {
    unitId?: string | null;
    quantity?: number;
    unitCost?: number;
    serials?: string[];
    warrantyExpiresOn?: string | null;
    note?: string;
  },
): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const { data: line } = await supabase
    .from("purchase_order_lines")
    .select("purchase_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Không tìm thấy dòng hàng." };
  const ok = await editablePo(supabase, line.purchase_order_id as string);
  if ("error" in ok) return ok;
  const patch: Record<string, unknown> = {};
  if (input.unitId !== undefined) patch.equipment_unit_id = input.unitId;
  if (input.quantity !== undefined) {
    if (!(input.quantity > 0)) return { error: "Số lượng phải lớn hơn 0." };
    patch.quantity = Math.round(input.quantity);
  }
  if (input.unitCost !== undefined) patch.unit_cost = Math.max(0, Math.round(input.unitCost || 0));
  if (input.serials !== undefined) {
    const list = input.serials.map((s) => s.trim()).filter(Boolean);
    const dup = list.find((s, i) => list.findIndex((x) => x.toLowerCase() === s.toLowerCase()) !== i);
    if (dup) return { error: `Serial ${dup} bị nhập 2 lần.` };
    patch.serials = list;
  }
  if (input.warrantyExpiresOn !== undefined) patch.warranty_expires_on = input.warrantyExpiresOn || null;
  if (input.note !== undefined) patch.note = input.note.trim() || null;
  const { error } = await supabase.from("purchase_order_lines").update(patch).eq("id", lineId);
  if (error) return { error: "Không lưu được dòng hàng: " + error.message };
  refresh(line.purchase_order_id as string);
  return { success: true };
}

export async function deletePurchaseLine(lineId: string): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const { data: line } = await supabase
    .from("purchase_order_lines")
    .select("purchase_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Không tìm thấy dòng hàng." };
  const ok = await editablePo(supabase, line.purchase_order_id as string);
  if ("error" in ok) return ok;
  const { error } = await supabase.from("purchase_order_lines").delete().eq("id", lineId);
  if (error) return { error: "Không xoá được dòng hàng: " + error.message };
  refresh(line.purchase_order_id as string);
  return { success: true };
}

// Nháp ↔ Đã đặt, Huỷ. Nhập kho đi qua receivePurchaseOrder.
export async function setPurchaseStatus(id: string, status: "draft" | "ordered" | "cancelled"): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const ok = await editablePo(supabase, id);
  if ("error" in ok) return ok;
  if (status === "cancelled") {
    const { count } = await supabase
      .from("supplier_payments")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", id);
    if (count) return { error: "Phiếu đã có khoản trả tiền — xoá khoản trả trước khi huỷ phiếu." };
  }
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
  if (error) return { error: "Không đổi được trạng thái: " + error.message };
  refresh(id);
  return { success: true };
}

export async function receivePurchaseOrder(id: string): Promise<Result> {
  await requireRole([...SUPPLIER_ROLES]);
  const { error } = await (await db()).rpc("receive_purchase_order", { p_id: id });
  if (error) {
    const msg = error.message.includes("identifier_code") ? "Có serial trùng với máy đã có trong CRM." : error.message;
    return { error: "Chưa nhập kho được: " + msg };
  }
  refresh(id);
  revalidatePath("/equipment");
  return { success: true };
}

export async function addSupplierPayment(input: {
  poId: string;
  amount: number;
  paidOn: string;
  method: "chuyen_khoan" | "tien_mat" | "khac";
  note?: string;
}): Promise<Result> {
  const employee = await requireRole([...SUPPLIER_ROLES]);
  if (!(input.amount > 0)) return { error: "Số tiền phải lớn hơn 0." };
  const supabase = await db();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("supplier_id, status")
    .eq("id", input.poId)
    .maybeSingle();
  if (!po) return { error: "Không tìm thấy phiếu mua." };
  if (po.status === "cancelled") return { error: "Phiếu đã huỷ." };
  const { error } = await supabase.from("supplier_payments").insert({
    supplier_id: po.supplier_id,
    purchase_order_id: input.poId,
    amount: Math.round(input.amount),
    paid_on: input.paidOn || vnTodayString(),
    method: input.method,
    note: input.note?.trim() || null,
    created_by: employee.id,
  });
  if (error) return { error: "Không ghi được khoản trả: " + error.message };
  refresh(input.poId);
  return { success: true };
}

export async function deleteSupplierPayment(paymentId: string): Promise<Result> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await db();
  const { data } = await supabase.from("supplier_payments").select("purchase_order_id").eq("id", paymentId).maybeSingle();
  const { error } = await supabase.from("supplier_payments").delete().eq("id", paymentId);
  if (error) return { error: "Không xoá được khoản trả: " + error.message };
  refresh((data?.purchase_order_id as string | null) ?? undefined);
  return { success: true };
}

// Xoá phiếu nháp / huỷ chưa có khoản trả (phiếu đã nhập kho giữ làm lịch sử).
export async function deletePurchaseOrder(id: string): Promise<Result> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await db();
  const { data: po } = await supabase.from("purchase_orders").select("status").eq("id", id).maybeSingle();
  if (!po) return { error: "Không tìm thấy phiếu mua." };
  if (po.status === "received") return { error: "Phiếu đã nhập kho — giữ làm lịch sử, không xoá." };
  const { count } = await supabase
    .from("supplier_payments")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", id);
  if (count) return { error: "Phiếu đã có khoản trả tiền — xoá khoản trả trước." };
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) return { error: "Không xoá được phiếu: " + error.message };
  refresh();
  return { success: true };
}
