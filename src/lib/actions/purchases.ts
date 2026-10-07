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
  kind?: "new" | "backfill";
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
      kind: input.kind === "backfill" ? "backfill" : "new",
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
  const employee = await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const { data: po } = await supabase.from("purchase_orders").select("status, order_date").eq("id", id).maybeSingle();
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
  } else if (po.status === "received" && MANAGE_ROLES.includes(employee.role)) {
    // Sửa phiếu đã nhập kho (CEO 2026-10-07): đổi NCC + ngày mua (ngày mua
    // của máy / giá vốn đi theo). Kho nhận không đổi được — máy đã ở kho.
    if (input.supplierId) patch.supplier_id = input.supplierId;
    if (input.orderDate && input.orderDate !== po.order_date) {
      patch.order_date = input.orderDate;
      const { error: e1 } = await supabase
        .from("equipment_instances")
        .update({ purchase_date: input.orderDate })
        .eq("purchase_order_id", id);
      if (e1) return { error: "Không đổi được ngày mua của máy: " + e1.message };
      await supabase.from("equipment_purchases").update({ purchase_date: input.orderDate }).eq("purchase_order_id", id);
    }
  }
  const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
  if (error) return { error: "Không lưu được phiếu: " + error.message };
  refresh(id);
  return { success: true };
}

// ---- Sửa phiếu ĐÃ NHẬP KHO (CEO 2026-10-07: "cho tao sửa phiếu mua hàng") ----
// Chỉ GĐ/Admin/KT. Sửa được: đơn giá (giá mua máy + giá vốn đi theo), serial
// từng máy, hạn bảo hành. Không đổi số lượng/kho (phải tạo/xoá máy thật).
async function receivedLine(supabase: SupabaseClient, lineId: string) {
  const { data: line } = await supabase
    .from("purchase_order_lines")
    .select("id, purchase_order_id, equipment_type_id, equipment_unit_id, serials, purchase_orders(status)")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Không tìm thấy dòng hàng." } as const;
  if ((line.purchase_orders as unknown as { status: string } | null)?.status !== "received")
    return { error: "Phiếu chưa nhập kho — sửa trực tiếp trên dòng." } as const;
  return { line } as const;
}

export async function updateReceivedLineCost(lineId: string, unitCost: number): Promise<Result> {
  await requireRole([...MANAGE_ROLES]);
  if (!(unitCost >= 0)) return { error: "Đơn giá không hợp lệ." };
  const supabase = await db();
  const r = await receivedLine(supabase, lineId);
  if ("error" in r) return { error: r.error as string };
  const cost = Math.round(unitCost);
  const poId = r.line.purchase_order_id as string;
  const { error } = await supabase.from("purchase_order_lines").update({ unit_cost: cost }).eq("id", lineId);
  if (error) return { error: "Không lưu được đơn giá: " + error.message };
  await supabase
    .from("equipment_instances")
    .update({ purchase_price: cost })
    .eq("purchase_order_id", poId)
    .eq("equipment_type_id", r.line.equipment_type_id as string);
  if (r.line.equipment_unit_id) {
    await supabase
      .from("equipment_purchases")
      .update({ unit_cost: cost })
      .eq("purchase_order_id", poId)
      .eq("equipment_unit_id", r.line.equipment_unit_id as string);
  }
  refresh(poId);
  revalidatePath("/equipment");
  return { success: true };
}

export async function updateReceivedLineWarranty(lineId: string, warranty: string | null): Promise<Result> {
  await requireRole([...MANAGE_ROLES]);
  const supabase = await db();
  const r = await receivedLine(supabase, lineId);
  if ("error" in r) return { error: r.error as string };
  const poId = r.line.purchase_order_id as string;
  await supabase.from("purchase_order_lines").update({ warranty_expires_on: warranty || null }).eq("id", lineId);
  const { error } = await supabase
    .from("equipment_instances")
    .update({ warranty_expires_on: warranty || null })
    .eq("purchase_order_id", poId)
    .eq("equipment_type_id", r.line.equipment_type_id as string);
  if (error) return { error: "Không lưu được bảo hành: " + error.message };
  refresh(poId);
  return { success: true };
}

// Đổi serial 1 máy đã nhập từ phiếu (vd thay serial tạm bằng serial thật).
export async function renameReceivedMachine(instanceId: string, newCode: string): Promise<Result> {
  await requireRole([...MANAGE_ROLES]);
  const code = newCode.trim();
  if (!code) return { error: "Serial không được trống." };
  const supabase = await db();
  const { data: inst } = await supabase
    .from("equipment_instances")
    .select("id, identifier_code, purchase_order_id, equipment_type_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst?.purchase_order_id) return { error: "Máy này không thuộc phiếu mua nào." };
  if (inst.identifier_code === code) return { success: true };
  const { data: dup } = await supabase.from("equipment_instances").select("id").ilike("identifier_code", code.replace(/[%_]/g, "\\$&")).neq("id", instanceId).limit(1);
  if (dup?.length) return { error: `Serial ${code} đã có trong CRM.` };
  const { error } = await supabase.from("equipment_instances").update({ identifier_code: code }).eq("id", instanceId);
  if (error) return { error: "Không đổi được serial: " + error.message };
  // Cập nhật danh sách serial trên dòng phiếu cho khớp.
  const { data: lines } = await supabase
    .from("purchase_order_lines")
    .select("id, serials")
    .eq("purchase_order_id", inst.purchase_order_id as string)
    .eq("equipment_type_id", inst.equipment_type_id as string);
  for (const l of lines ?? []) {
    const list = (l.serials as string[]) ?? [];
    const i = list.findIndex((s) => s.toLowerCase() === String(inst.identifier_code).toLowerCase());
    if (i >= 0) {
      list[i] = code;
      await supabase.from("purchase_order_lines").update({ serials: list }).eq("id", l.id as string);
    }
  }
  refresh(inst.purchase_order_id as string);
  revalidatePath("/equipment");
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
    // Phiếu ghi lại máy có sẵn: số lượng = số máy đã chọn.
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("kind")
      .eq("id", line.purchase_order_id as string)
      .maybeSingle();
    if (po?.kind === "backfill" && list.length > 0) patch.quantity = list.length;
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

// Máy serial có sẵn của 1 mã hàng để chọn vào phiếu "Ghi lại hàng đã có" —
// kèm phiếu đang gắn (nếu có) để biết máy nào đã có NCC.
export async function listBackfillMachines(typeId: string): Promise<
  | { error: string }
  | {
      machines: {
        code: string;
        unitName: string | null;
        branchName: string | null;
        status: string;
        purchaseDate: string | null;
        purchasePrice: number | null;
        poCode: string | null;
      }[];
    }
> {
  await requireRole([...SUPPLIER_ROLES]);
  const supabase = await db();
  const { data, error } = await supabase
    .from("equipment_instances")
    .select(
      "identifier_code, status, purchase_date, purchase_price, purchase_order_id, equipment_units(brand_model), branches(name), purchase_orders(code)",
    )
    .eq("equipment_type_id", typeId)
    .order("identifier_code")
    .limit(1000);
  if (error) return { error: "Không tải được danh sách máy: " + error.message };
  return {
    machines: (data ?? []).map((m) => ({
      code: m.identifier_code as string,
      unitName: (m.equipment_units as unknown as { brand_model: string } | null)?.brand_model ?? null,
      branchName: (m.branches as unknown as { name: string } | null)?.name ?? null,
      status: m.status as string,
      purchaseDate: (m.purchase_date as string | null) ?? null,
      purchasePrice: m.purchase_price == null ? null : Number(m.purchase_price),
      poCode: (m.purchase_orders as unknown as { code: string } | null)?.code ?? null,
    })),
  };
}
