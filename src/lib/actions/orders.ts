"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, requireRole } from "@/lib/dal";
import { computeOrderLinePrice, type PricingTierInput } from "@/lib/rental-pricing";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import { ALL_ROLES, BRANCH_SCOPED_ROLES, EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { DELIVERY_NOTE_TYPE_IDS, TRANSPORT_LINE_CATEGORY_BY_TYPE_ID } from "@/lib/commission";
import { formatVNDate, vnNow, vnTodayString } from "@/lib/vn-time";
import type { TaskType } from "@/types/database";

const DELETE_ROLES = MANAGE_ROLES;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ActionState = { error: string } | { success: true } | undefined;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

const OrderSchema = z
  .object({
    order_code: z.string().trim().min(1, { message: "Mã đơn không được để trống." }),
    pickup_branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh giao." }),
    // Bỏ trống = thu hồi tại chính chi nhánh giao (tình huống phổ biến).
    return_branch_id: z.string().uuid().optional(),
    customer_id: z.string().uuid({ message: "Vui lòng chọn khách hàng." }),
    // Người trực tiếp đặt đơn này — độc lập với khách hàng trên hợp đồng, vì
    // khách agency có thể có nhiều nhân sự khác nhau gọi đặt cho từng đơn.
    orderer_name: z.string().trim().optional(),
    orderer_phone: z.string().trim().optional(),
    orderer_email: z
      .union([z.literal(""), z.string().trim().email({ message: "Email người đặt không hợp lệ." })])
      .optional(),
    order_date: z.string().min(1, { message: "Vui lòng chọn ngày." }),
  })
  .transform((data) => ({
    ...data,
    return_branch_id: data.return_branch_id ?? data.pickup_branch_id,
    orderer_name: data.orderer_name || null,
    orderer_phone: data.orderer_phone || null,
    orderer_email: data.orderer_email || null,
  }));

function parseOrderForm(formData: FormData) {
  return OrderSchema.safeParse({
    order_code: formData.get("order_code"),
    pickup_branch_id: formData.get("pickup_branch_id"),
    return_branch_id: formData.get("return_branch_id") || undefined,
    customer_id: formData.get("customer_id"),
    orderer_name: formData.get("orderer_name") || undefined,
    orderer_phone: formData.get("orderer_phone") || undefined,
    orderer_email: formData.get("orderer_email") || undefined,
    order_date: formData.get("order_date"),
  });
}

export async function createOrder(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);

  const parsed = parseOrderForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .insert({ ...parsed.data, created_by: employee.id })
    .select("id")
    .single();

  if (error) {
    return { error: "Không thể tạo đơn hàng: " + error.message };
  }

  revalidatePath("/orders");
  redirect(`/orders/${data.id}`);
}

export async function updateOrder(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = parseOrderForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("orders").update(parsed.data).eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật đơn hàng: " + error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { success: true };
}

const OrderTotalOverrideSchema = z.object({
  total_value: z.coerce.number().min(0, { message: "Doanh số không được âm." }),
});

// Sửa tay doanh số = đặt lại tổng giá trị đơn mong muốn. Khoản chênh lệch so
// với tổng hiện tại (số tiền giảm/tăng) được phân bổ ĐỀU vào các dòng hàng
// CHO THUÊ (không đụng vào dòng dịch vụ hoặc bán hàng) — orders.total_value
// sau đó tự khớp lại nhờ trigger recalc_order_total.
export async function overrideOrderTotal(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OrderTotalOverrideSchema.safeParse({ total_value: formData.get("total_value") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("order_equipment")
    .select("id, quantity, line_total, equipment_type_id")
    .eq("order_id", id);
  const lineList = lines ?? [];

  if (!lineList.length) {
    return { error: "Đơn chưa có dòng hàng nào để phân bổ." };
  }

  const typeIds = [...new Set(lineList.map((l) => l.equipment_type_id).filter((tid): tid is string => tid !== null))];
  const { data: types } = await supabase
    .from("equipment_types")
    .select("id, product_type")
    .in("id", typeIds);
  const productTypeById = new Map((types ?? []).map((t) => [t.id, t.product_type]));

  const currentSum = round2(lineList.reduce((sum, l) => sum + l.line_total, 0));
  const diff = round2(currentSum - parsed.data.total_value);

  if (diff === 0) {
    return { success: true };
  }

  const eligible = lineList.filter(
    (l) => l.equipment_type_id !== null && productTypeById.get(l.equipment_type_id) === "rental",
  );
  if (!eligible.length) {
    return { error: "Không có dòng hàng cho thuê nào để phân bổ (không trừ vào dịch vụ/bán hàng)." };
  }

  const shareBase = Math.round(diff / eligible.length);
  let allocated = 0;
  const updates = eligible.map((line, index) => {
    const isLast = index === eligible.length - 1;
    const share = isLast ? diff - allocated : shareBase;
    allocated += share;
    return { line, newLineTotal: round2(line.line_total - share) };
  });

  if (updates.some((u) => u.newLineTotal < 0)) {
    return { error: "Số tiền giảm giá vượt quá tổng giá trị các dòng cho thuê." };
  }

  for (const { line, newLineTotal } of updates) {
    const newUnitPrice = round2(newLineTotal / line.quantity);
    const { error } = await supabase
      .from("order_equipment")
      .update({ unit_price: newUnitPrice, line_total: newLineTotal })
      .eq("id", line.id);
    if (error) {
      return { error: "Không thể phân bổ giảm giá: " + error.message };
    }
  }

  revalidatePath(`/orders/${id}`);
  return { success: true };
}

const OrderLineQuantitySchema = z.object({
  quantity: z.coerce.number().int().min(1, { message: "Số lượng phải lớn hơn 0." }),
});

// Sửa số lượng 1 dòng hàng (chỉ áp dụng dòng theo số lượng — hàng theo dõi
// riêng lẻ (equipment_instance_id) luôn cố định số lượng 1, DB đã ràng buộc
// bằng trigger check_order_equipment_line). line_total = quantity * unit_price
// hiện tại — orders.total_value tự khớp lại nhờ trigger recalc_order_total.
export async function updateOrderEquipmentLineQuantity(
  lineId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OrderLineQuantitySchema.safeParse({ quantity: formData.get("quantity") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from("order_equipment")
    .select("order_id, unit_price, equipment_instance_id")
    .eq("id", lineId)
    .single();

  if (lineError || !line) {
    return { error: "Không tìm thấy dòng hàng." };
  }

  if (line.equipment_instance_id) {
    return { error: "Hàng theo dõi riêng lẻ (từng sản phẩm) luôn có số lượng 1, không thể sửa." };
  }

  const lineTotal = round2(parsed.data.quantity * line.unit_price);
  const { error } = await supabase
    .from("order_equipment")
    .update({ quantity: parsed.data.quantity, line_total: lineTotal })
    .eq("id", lineId);

  if (error) {
    return { error: "Không thể sửa số lượng: " + error.message };
  }

  revalidatePath(`/orders/${line.order_id}`);
  return { success: true };
}

const OrderLinePriceSchema = z.object({
  unit_price: z.coerce.number().min(0, { message: "Đơn giá không được âm." }),
});

// Sửa thẳng đơn giá 1 dòng hàng (VD: giảm giá riêng cho khách). line_total =
// unit_price * quantity — orders.total_value tự khớp lại nhờ trigger.
export async function updateOrderEquipmentLinePrice(
  lineId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OrderLinePriceSchema.safeParse({ unit_price: formData.get("unit_price") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from("order_equipment")
    .select("order_id, quantity")
    .eq("id", lineId)
    .single();

  if (lineError || !line) {
    return { error: "Không tìm thấy dòng hàng." };
  }

  const lineTotal = round2(parsed.data.unit_price * line.quantity);
  const { error } = await supabase
    .from("order_equipment")
    .update({ unit_price: parsed.data.unit_price, line_total: lineTotal })
    .eq("id", lineId);

  if (error) {
    return { error: "Không thể sửa đơn giá: " + error.message };
  }

  revalidatePath(`/orders/${line.order_id}`);
  return { success: true };
}

const AssignOrderLineEmployeeSchema = z.object({
  employee_id: z.string().uuid().optional(),
  // Chỉ có ý nghĩa với 2 dòng phí vận chuyển (giao/thu hồi bằng xe máy).
  delivery_method: z.enum(["self_ride", "external_service"]).optional(),
});

// Gán nhân viên thực hiện 1 dòng dịch vụ trả khoán trực tiếp (Lắp đặt/Tháo
// dỡ/Hỗ trợ kỹ thuật... hoặc phí vận chuyển giao/thu hồi bằng xe máy) — tự
// đóng dấu ngày hôm nay khi gán, xoá khi bỏ chọn, giống hệt semantics
// completed_date của upsertOrderTask. Chỉ áp dụng dòng có
// equipment_type.payout_percentage khác null HOẶC nằm trong
// TRANSPORT_LINE_CATEGORY_BY_TYPE_ID (payout %động, không set trên
// equipment_types) — kiểm tra lại ở đây dù UI đã ẩn field với dòng khác.
//
// Quyền: dòng dịch vụ tĩnh (Lắp đặt/Tháo dỡ/Support) chỉ Admin/Kế toán/Giám
// đốc gán được, như cũ. Riêng 2 dòng vận chuyển (giao/thu hồi xe máy) — theo
// yêu cầu CEO — Cửa hàng trưởng/Kỹ thuật-Sale được TỰ điền (chọn bất kỳ nhân
// viên nào, không giới hạn tự chọn mình), Admin/Kế toán/Giám đốc rà lại thủ
// công sau (không có trạng thái "đã xác nhận" riêng — sửa lại trực tiếp nếu
// sai là đủ).
export async function assignOrderLineEmployee(
  lineId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await getCurrentEmployee();
  if (!viewer) {
    redirect("/");
  }

  const parsed = AssignOrderLineEmployeeSchema.safeParse({
    employee_id: formData.get("employee_id") || undefined,
    delivery_method: formData.get("delivery_method") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from("order_equipment")
    .select("order_id, equipment_type_id")
    .eq("id", lineId)
    .single();

  if (lineError || !line) {
    return { error: "Không tìm thấy dòng hàng." };
  }

  const isTransportLine = !!line.equipment_type_id && line.equipment_type_id in TRANSPORT_LINE_CATEGORY_BY_TYPE_ID;
  const allowedRoles = isTransportLine ? [...MANAGE_ROLES, ...BRANCH_SCOPED_ROLES] : [...MANAGE_ROLES];
  if (!allowedRoles.includes(viewer.role)) {
    return { error: "Bạn không có quyền gán nhân viên cho dòng hàng này." };
  }

  const { data: equipmentType } = line.equipment_type_id
    ? await supabase
        .from("equipment_types")
        .select("payout_percentage")
        .eq("id", line.equipment_type_id)
        .maybeSingle()
    : { data: null };
  if (equipmentType?.payout_percentage == null && !isTransportLine) {
    return { error: "Dòng hàng này không phải dịch vụ trả khoán trực tiếp." };
  }

  const { error } = await supabase
    .from("order_equipment")
    .update({
      employee_id: parsed.data.employee_id ?? null,
      completed_date: parsed.data.employee_id ? vnTodayString() : null,
      delivery_method:
        isTransportLine && parsed.data.employee_id ? (parsed.data.delivery_method ?? null) : null,
    })
    .eq("id", lineId);

  if (error) {
    return { error: "Không thể gán nhân viên: " + error.message };
  }

  revalidatePath(`/orders/${line.order_id}`);
  return { success: true };
}

const OrderLineNoteSchema = z.object({
  note: z.string().max(500, { message: "Ghi chú tối đa 500 ký tự." }).optional(),
});

// Ghi chú tự do cho 4 dòng phí vận chuyển (giao/thu hồi bằng xe máy hoặc ô
// tô) — chỗ điền địa chỉ + SĐT nhận/trả hàng. Tách khỏi
// assignOrderLineEmployee vì độc lập hoàn toàn với việc gán nhân viên/tính
// khoán (2 dòng ô tô hiện còn CHƯA gán nhân viên được — xem comment tại
// assignOrderLineEmployee — nhưng vẫn cần ghi chú được như thường).
// Quyền giống hệt gán nhân viên dòng vận chuyển: CHT/Kỹ thuật-Sale tự điền
// được (theo yêu cầu CEO), không giới hạn Admin/Kế toán/Giám đốc.
export async function updateOrderLineNote(
  lineId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await getCurrentEmployee();
  if (!viewer) {
    redirect("/");
  }

  const parsed = OrderLineNoteSchema.safeParse({ note: formData.get("note") || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from("order_equipment")
    .select("order_id, equipment_type_id")
    .eq("id", lineId)
    .single();

  if (lineError || !line) {
    return { error: "Không tìm thấy dòng hàng." };
  }
  if (!line.equipment_type_id || !DELIVERY_NOTE_TYPE_IDS.has(line.equipment_type_id)) {
    return { error: "Dòng hàng này không phải dịch vụ vận chuyển." };
  }
  const allowedRoles = [...MANAGE_ROLES, ...BRANCH_SCOPED_ROLES];
  if (!allowedRoles.includes(viewer.role)) {
    return { error: "Bạn không có quyền ghi chú dòng hàng này." };
  }

  const { error } = await supabase
    .from("order_equipment")
    .update({ note: parsed.data.note?.trim() || null })
    .eq("id", lineId);

  if (error) {
    return { error: "Không thể lưu ghi chú: " + error.message };
  }

  revalidatePath(`/orders/${line.order_id}`);
  return { success: true };
}

const RentalPeriodSchema = z.object({
  rental_start_at: z.string().min(1, { message: "Vui lòng chọn ngày giờ bắt đầu thuê." }),
  rental_end_at: z.string().min(1, { message: "Vui lòng chọn ngày giờ kết thúc thuê." }),
});

// Sửa thời gian thuê của đơn (áp dụng chung mọi dòng hàng cho thuê trong đơn —
// quy định công ty: bắt đầu/kết thúc cùng nhau). Tính lại giá tất cả dòng cho
// thuê hiện có theo thời gian mới.
export async function updateOrderRentalPeriod(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = RentalPeriodSchema.safeParse({
    rental_start_at: formData.get("rental_start_at"),
    rental_end_at: formData.get("rental_end_at"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  const { error: updateError } = await supabase.from("orders").update(parsed.data).eq("id", id);
  if (updateError) {
    return { error: "Không thể cập nhật thời gian thuê: " + updateError.message };
  }

  const { data: lines } = await supabase
    .from("order_equipment")
    .select("id, equipment_type_id, equipment_unit_id, equipment_instance_id, quantity")
    .eq("order_id", id);

  for (const line of lines ?? []) {
    if (!line.equipment_type_id) continue; // dòng tự do — giá do người nhập tự gõ, không tính lại

    const unitPriceOverride = await resolveUnitPriceOverride(
      supabase,
      line.equipment_unit_id,
      line.equipment_instance_id,
    );
    const { equipmentType, computed } = await computeLineForEquipmentType(
      supabase,
      line.equipment_type_id,
      parsed.data.rental_start_at,
      parsed.data.rental_end_at,
      line.quantity,
      unitPriceOverride,
    );
    if (equipmentType.product_type !== "rental") continue;

    await supabase
      .from("order_equipment")
      .update({ unit_price: computed.unitPrice, line_total: computed.lineTotal })
      .eq("id", line.id);
  }

  revalidatePath(`/orders/${id}`);
  return { success: true };
}

const OrderContactInfoSchema = z
  .object({
    customer_id: z.string().uuid({ message: "Vui lòng chọn khách hàng." }),
    orderer_name: z.string().trim().optional(),
    orderer_phone: z.string().trim().optional(),
    orderer_email: z
      .union([z.literal(""), z.string().trim().email({ message: "Email người đặt không hợp lệ." })])
      .optional(),
  })
  .transform((data) => ({
    ...data,
    orderer_name: data.orderer_name || null,
    orderer_phone: data.orderer_phone || null,
    orderer_email: data.orderer_email || null,
  }));

// Sửa nhanh khách hàng + người đặt hàng ngay tại trang xem đơn, không cần mở
// dialog "Sửa đơn hàng" đầy đủ (vốn còn kèm mã đơn/chi nhánh/ngày).
export async function updateOrderContactInfo(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = OrderContactInfoSchema.safeParse({
    customer_id: formData.get("customer_id"),
    orderer_name: formData.get("orderer_name") || undefined,
    orderer_phone: formData.get("orderer_phone") || undefined,
    orderer_email: formData.get("orderer_email") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("orders").update(parsed.data).eq("id", id);
  if (error) {
    return { error: "Không thể cập nhật thông tin đơn: " + error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { success: true };
}

export async function deleteOrder(id: string) {
  await requireRole([...DELETE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá đơn hàng: " + error.message);
  }

  revalidatePath("/orders");
}

// Mở lại đơn đã hoàn tất — chỉ Admin/Kế toán. Đưa status về đúng khâu hiện
// tại theo order_tasks (khâu sớm nhất chưa hoàn thành, hoặc khâu cuối nếu đã
// xong hết) thay vì dựa vào giá trị status cũ — vì trigger sync_order_status
// chỉ cập nhật khi completed_at is null nên status có thể bị "đứng hình" từ
// lúc đóng đơn.
export async function reopenOrder(id: string): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("order_tasks")
    .select("task_type, completed_date")
    .eq("order_id", id);

  const doneSet = new Set((tasks ?? []).filter((t) => t.completed_date).map((t) => t.task_type));
  const nextStatus =
    TASK_TYPE_SEQUENCE.find((t) => !doneSet.has(t)) ?? TASK_TYPE_SEQUENCE[TASK_TYPE_SEQUENCE.length - 1];

  const { error } = await supabase
    .from("orders")
    .update({ completed_at: null, status: nextStatus })
    .eq("id", id);

  if (error) {
    return { error: "Không thể mở lại đơn: " + error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  return { success: true };
}

// Huỷ đơn — mốc kết thúc riêng, loại trừ với "Hoàn tất" (DB check
// orders_not_completed_and_cancelled). Không tính khoán, không xoá dữ liệu.
export async function cancelOrder(id: string) {
  await requireRole([...ALL_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error("Không thể huỷ đơn: " + error.message);
  }

  // Huỷ đơn ĐÃ giao hàng: trả hàng của đơn về "trong kho" tại chi nhánh thu
  // hồi để tồn kho không kẹt ở trạng thái "ở khách". Chỉ gọi khi đơn đã giao
  // thật — đơn chưa giao mà gọi return sẽ dời nhầm vị trí/trạng thái sản phẩm
  // riêng lẻ chưa từng rời kho.
  const { data: cancelled } = await supabase
    .from("orders")
    .select("delivery_stock_moved_at")
    .eq("id", id)
    .maybeSingle();
  if (cancelled?.delivery_stock_moved_at) {
    await supabase.rpc("return_order_stock", { p_order_id: id });
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

function generateOrderCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `DH${y}${m}${d}-${rand}`;
}

// Nhân bản đơn — tạo đơn mới (nháp, 0/10 khâu, chưa hoàn tất/huỷ) copy chi
// nhánh/khách hàng/thời gian thuê + toàn bộ dòng hàng (đúng số lượng & đơn
// giá cũ, không tính lại) từ đơn gốc. Giữ lại thời gian thuê cũ vì DB bắt
// buộc đơn phải có thời gian thuê mới thêm được dòng cho thuê — nhân viên
// chỉnh lại ngày giờ thực tế ngay sau khi tạo (giá dòng cho thuê tự tính lại
// theo thời gian mới lúc đó).
export async function duplicateOrder(id: string): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);

  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from("orders")
    .select("pickup_branch_id, return_branch_id, customer_id, rental_start_at, rental_end_at")
    .eq("id", id)
    .single();

  if (sourceError || !source) {
    return { error: "Không tìm thấy đơn gốc." };
  }

  const { data: sourceLines, error: linesError } = await supabase
    .from("order_equipment")
    .select(
      "equipment_type_id, custom_name, equipment_unit_id, equipment_instance_id, quantity, unit_price, line_total",
    )
    .eq("order_id", id);

  if (linesError) {
    return { error: "Không đọc được dòng hàng gốc: " + linesError.message };
  }

  const today = vnNow();
  const { data: newOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      order_code: generateOrderCode(today),
      pickup_branch_id: source.pickup_branch_id,
      return_branch_id: source.return_branch_id,
      customer_id: source.customer_id,
      order_date: formatVNDate(today),
      rental_start_at: source.rental_start_at,
      rental_end_at: source.rental_end_at,
      created_by: employee.id,
    })
    .select("id")
    .single();

  if (insertError || !newOrder) {
    return { error: "Không thể tạo đơn nháp: " + (insertError?.message ?? "") };
  }

  if (sourceLines?.length) {
    const { error: copyError } = await supabase.from("order_equipment").insert(
      sourceLines.map((line) => ({
        order_id: newOrder.id,
        equipment_type_id: line.equipment_type_id,
        custom_name: line.custom_name,
        equipment_unit_id: line.equipment_unit_id,
        equipment_instance_id: line.equipment_instance_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.line_total,
      })),
    );
    if (copyError) {
      return { error: "Đã tạo đơn nháp nhưng copy dòng hàng lỗi: " + copyError.message };
    }
  }

  revalidatePath("/orders");
  redirect(`/orders/${newOrder.id}`);
}

// ---------------------------------------------------------------------------
// order_equipment — dòng thiết bị/sản phẩm trong đơn. Server Action tự tra
// equipment_types (+ bảng giá mẫu nếu có) để tính unit_price/line_total —
// client chỉ gửi lựa chọn sản phẩm + số lượng + ngày thuê (nếu có).
// ---------------------------------------------------------------------------

async function fetchEquipmentTypeForPricing(supabase: SupabaseServerClient, equipmentTypeId: string) {
  const { data: equipmentType, error: typeError } = await supabase
    .from("equipment_types")
    .select(
      "name, product_type, tracking_type, pricing_method, price, rental_period_unit, pricing_template_id",
    )
    .eq("id", equipmentTypeId)
    .single();

  if (typeError || !equipmentType) {
    throw new Error("Không tìm thấy loại hàng hoá.");
  }

  let tiers: PricingTierInput[] = [];
  if (equipmentType.pricing_method === "pricing_structure" && equipmentType.pricing_template_id) {
    const { data: tierRows } = await supabase
      .from("pricing_template_tiers")
      .select("min_duration, duration_unit, discount_percentage")
      .eq("template_id", equipmentType.pricing_template_id);
    tiers = tierRows ?? [];
  }

  return { equipmentType, tiers };
}

function computeLinePrice(
  equipmentType: Awaited<ReturnType<typeof fetchEquipmentTypeForPricing>>["equipmentType"],
  tiers: PricingTierInput[],
  rentalStartAt: string | null,
  rentalEndAt: string | null,
  quantity: number,
  // Giá riêng của biến thể (equipment_units.price) khi đã xác định được biến
  // thể cụ thể — null/undefined = dùng giá chung của sản phẩm như trước.
  unitPriceOverride?: number | null,
) {
  return computeOrderLinePrice({
    productType: equipmentType.product_type,
    price: unitPriceOverride ?? equipmentType.price,
    rentalPeriodUnit: equipmentType.rental_period_unit,
    pricingMethod: equipmentType.pricing_method,
    tiers,
    rentalStartAt,
    rentalEndAt,
    quantity,
  });
}

async function computeLineForEquipmentType(
  supabase: SupabaseServerClient,
  equipmentTypeId: string,
  rentalStartAt: string | null,
  rentalEndAt: string | null,
  quantity: number,
  unitPriceOverride?: number | null,
) {
  const { equipmentType, tiers } = await fetchEquipmentTypeForPricing(supabase, equipmentTypeId);
  const computed = computeLinePrice(
    equipmentType,
    tiers,
    rentalStartAt,
    rentalEndAt,
    quantity,
    unitPriceOverride,
  );
  return { equipmentType, computed };
}

// Biến thể (equipment_unit) có thể được chọn trực tiếp (hàng theo số lượng)
// hoặc gián tiếp qua equipment_instance.equipment_unit_id (hàng theo từng
// sản phẩm, biến thể chỉ là nhãn phân loại — xem migration 20260802040000).
// Dùng chung 1 hàm tra giá riêng cho cả 2 trường hợp.
async function resolveUnitPriceOverride(
  supabase: SupabaseServerClient,
  equipmentUnitId: string | null,
  equipmentInstanceId: string | null,
): Promise<number | null> {
  if (equipmentUnitId) {
    const { data } = await supabase
      .from("equipment_units")
      .select("price")
      .eq("id", equipmentUnitId)
      .maybeSingle();
    return data?.price ?? null;
  }
  if (equipmentInstanceId) {
    const { data: instance } = await supabase
      .from("equipment_instances")
      .select("equipment_unit_id")
      .eq("id", equipmentInstanceId)
      .maybeSingle();
    if (!instance?.equipment_unit_id) return null;
    const { data: unit } = await supabase
      .from("equipment_units")
      .select("price")
      .eq("id", instance.equipment_unit_id)
      .maybeSingle();
    return unit?.price ?? null;
  }
  return null;
}

const OrderEquipmentLineSchema = z.object({
  order_id: z.string().uuid(),
  equipment_type_id: z.string().uuid({ message: "Vui lòng chọn hàng hoá." }),
  equipment_unit_id: z.string().uuid().optional(),
  equipment_instance_id: z.string().uuid().optional(),
  quantity: z.coerce.number().int().min(1, { message: "Số lượng phải lớn hơn 0." }),
});

export async function addOrderEquipmentLine(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = OrderEquipmentLineSchema.safeParse({
    order_id: formData.get("order_id"),
    equipment_type_id: formData.get("equipment_type_id"),
    equipment_unit_id: formData.get("equipment_unit_id") || undefined,
    equipment_instance_id: formData.get("equipment_instance_id") || undefined,
    quantity: formData.get("quantity"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("rental_start_at, rental_end_at")
    .eq("id", parsed.data.order_id)
    .single();

  let equipmentType;
  let tiers;
  try {
    ({ equipmentType, tiers } = await fetchEquipmentTypeForPricing(
      supabase,
      parsed.data.equipment_type_id,
    ));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tính được giá dòng hàng." };
  }

  // Hàng bán/cho thuê theo số lượng bắt buộc gắn biến thể (tồn kho bám theo
  // equipment_units — trigger check_order_equipment_line chặn nếu thiếu).
  // Đa số loại hàng thực tế chỉ có 0-1 biến thể nên client không bắt chọn
  // nữa: 1 biến thể thì tự dùng, CHƯA có thì tự tạo ngầm biến thể mặc định
  // trùng tên sản phẩm — qua admin client vì RLS chỉ cho Giám đốc/Admin/Kế
  // toán ghi equipment_units, còn đây là ghi sổ hệ thống, an toàn cho mọi
  // role được phép thêm dòng hàng.
  let equipmentUnitId = parsed.data.equipment_unit_id ?? null;
  const needsUnit =
    equipmentType.product_type === "sale" ||
    (equipmentType.product_type === "rental" && equipmentType.tracking_type === "quantity");
  if (needsUnit && !equipmentUnitId) {
    const { data: units } = await supabase
      .from("equipment_units")
      .select("id")
      .eq("equipment_type_id", parsed.data.equipment_type_id);
    if (units && units.length === 1) {
      equipmentUnitId = units[0].id;
    } else if (units && units.length > 1) {
      return { error: "Loại hàng này có nhiều biến thể — vui lòng chọn biến thể cụ thể." };
    } else {
      // RPC security definer (không phải admin client) — xem ghi chú trong
      // migration 20260802020000: import @supabase/supabase-js thuần vào
      // orders.ts từng làm sập Worker (eval bị Cloudflare chặn ngay lúc nạp
      // module, trước khi code chạy tới).
      const { data: newUnitId, error: unitError } = await supabase.rpc(
        "ensure_default_equipment_unit",
        { p_equipment_type_id: parsed.data.equipment_type_id },
      );
      if (unitError || !newUnitId) {
        return {
          error: "Không tạo được biến thể mặc định cho loại hàng này: " + (unitError?.message ?? ""),
        };
      }
      equipmentUnitId = newUnitId;
    }
  }

  // Tra giá riêng biến thể SAU khi đã biết chắc equipmentUnitId (biến thể
  // chọn thẳng, biến thể duy nhất tự dùng, hay biến thể mặc định vừa tạo) —
  // null nếu biến thể không có giá riêng, khi đó computeLinePrice tự rơi về
  // giá chung equipmentType.price như trước giờ.
  const unitPriceOverride = await resolveUnitPriceOverride(
    supabase,
    equipmentUnitId,
    parsed.data.equipment_instance_id ?? null,
  );
  const computed = computeLinePrice(
    equipmentType,
    tiers,
    order?.rental_start_at ?? null,
    order?.rental_end_at ?? null,
    parsed.data.quantity,
    unitPriceOverride,
  );

  const { error } = await supabase.from("order_equipment").insert({
    order_id: parsed.data.order_id,
    equipment_type_id: parsed.data.equipment_type_id,
    equipment_unit_id: equipmentUnitId,
    equipment_instance_id: parsed.data.equipment_instance_id ?? null,
    quantity: parsed.data.quantity,
    unit_price: computed.unitPrice,
    line_total: computed.lineTotal,
  });

  if (error) {
    return { error: "Không thể thêm dòng hàng: " + error.message };
  }

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { success: true };
}

const CustomOrderLineSchema = z.object({
  order_id: z.string().uuid(),
  custom_name: z.string().trim().min(1, { message: "Vui lòng nhập tên." }),
  quantity: z.coerce.number().int().min(1, { message: "Số lượng phải lớn hơn 0." }),
  unit_price: z.coerce.number().min(0, { message: "Đơn giá không được âm." }),
});

// Dòng hàng "tự do" — không gắn equipment_type, dùng cho phụ phí/khoản phát
// sinh không đáng tạo hẳn 1 SKU trong danh mục. Không tra giá catalog, giá do
// người nhập tự gõ tay.
export async function addCustomOrderLine(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = CustomOrderLineSchema.safeParse({
    order_id: formData.get("order_id"),
    custom_name: formData.get("custom_name"),
    quantity: formData.get("quantity"),
    unit_price: formData.get("unit_price"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("order_equipment").insert({
    order_id: parsed.data.order_id,
    equipment_type_id: null,
    custom_name: parsed.data.custom_name,
    equipment_unit_id: null,
    equipment_instance_id: null,
    quantity: parsed.data.quantity,
    unit_price: parsed.data.unit_price,
    line_total: round2(parsed.data.unit_price * parsed.data.quantity),
  });

  if (error) {
    return { error: "Không thể thêm dòng hàng: " + error.message };
  }

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { success: true };
}

export async function deleteOrderEquipmentLine(id: string) {
  await requireRole([...ALL_ROLES]);

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("order_equipment")
    .select("order_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("order_equipment").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá dòng hàng: " + error.message);
  }

  if (line) {
    revalidatePath(`/orders/${line.order_id}`);
  }
}

// Kéo thả sắp xếp lại thứ tự dòng hàng trong "Danh sách thiết bị" —
// orderedLineIds là toàn bộ id dòng hàng của đơn, theo thứ tự hiển thị mới.
export async function reorderOrderEquipmentLines(orderId: string, orderedLineIds: string[]) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const results = await Promise.all(
    orderedLineIds.map((lineId, index) =>
      supabase
        .from("order_equipment")
        .update({ position: index + 1 })
        .eq("id", lineId)
        .eq("order_id", orderId),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error("Không thể lưu thứ tự dòng hàng: " + failed.error.message);
  }

  revalidatePath(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// order_tasks — 10 khâu tính khoán, bắt buộc hoàn thành tuần tự.
// ---------------------------------------------------------------------------

const UpsertOrderTaskSchema = z.object({
  order_id: z.string().uuid(),
  task_type: z.enum(TASK_TYPE_SEQUENCE),
  employee_id: z.string().uuid().optional(),
  note: z.string().trim().optional(),
  has_issue: z.coerce.boolean().optional(),
  completed: z.coerce.boolean().optional(),
});

export async function upsertOrderTask(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = UpsertOrderTaskSchema.safeParse({
    order_id: formData.get("order_id"),
    task_type: formData.get("task_type"),
    employee_id: formData.get("employee_id") || undefined,
    note: formData.get("note") || undefined,
    has_issue: formData.get("has_issue") ? true : false,
    completed: formData.get("completed") ? true : false,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();

  if (parsed.data.completed) {
    const sequenceIndex = TASK_TYPE_SEQUENCE.indexOf(parsed.data.task_type);
    const earlierStages = TASK_TYPE_SEQUENCE.slice(0, sequenceIndex);
    if (earlierStages.length > 0) {
      const { data: doneTasks } = await supabase
        .from("order_tasks")
        .select("task_type")
        .eq("order_id", parsed.data.order_id)
        .not("completed_date", "is", null);

      const doneSet = new Set((doneTasks ?? []).map((t) => t.task_type));
      const missing = earlierStages.find((stage) => !doneSet.has(stage));
      if (missing) {
        return { error: `Phải hoàn thành khâu "${TASK_TYPE_LABELS[missing]}" trước khi hoàn thành khâu này.` };
      }
    }
  }

  const { error } = await supabase.from("order_tasks").upsert(
    {
      order_id: parsed.data.order_id,
      task_type: parsed.data.task_type,
      employee_id: parsed.data.employee_id ?? null,
      note: parsed.data.note ?? null,
      has_issue: parsed.data.has_issue ?? false,
      completed_date: parsed.data.completed ? vnTodayString() : null,
    },
    { onConflict: "order_id,task_type" },
  );

  if (error) {
    return { error: "Không thể cập nhật khâu: " + error.message };
  }

  // Tồn kho phản ánh vật lý theo khâu: hoàn thành Giao hàng & bàn giao thì
  // chuyển hàng của đơn từ "trong kho" sang "ở khách" (sản phẩm riêng lẻ sang
  // Đang cho thuê); hoàn thành Nhập kho & bảo trì thì trả về "trong kho" tại
  // chi nhánh thu hồi (kèm chuyển kho + lịch sử nếu khác chi nhánh giao). Cả
  // 2 function đều idempotent qua timestamp trên orders — khâu bị mở lại rồi
  // hoàn thành lại không cộng/trừ kho lần nữa.
  //
  // Lỗi ở đây KHÔNG được nuốt im lặng nữa — trước đây throw ra bị bỏ qua nên
  // khâu vẫn báo lưu thành công dù tồn kho không hề nhúc nhích (đã gặp thật ở
  // BQ11779/BQ32, xem migration 20260801060000_fix_stuck_return_stock.sql).
  // Khâu vẫn giữ nguyên completed_date (đúng thực tế đã xảy ra), chỉ báo lỗi
  // để người dùng biết mà kiểm tra tay thay vì tưởng đã trả/trừ kho xong.
  if (parsed.data.completed && parsed.data.task_type === "giao_hang_ban_giao") {
    const { error: deliverError } = await supabase.rpc("deliver_order_stock", {
      p_order_id: parsed.data.order_id,
    });
    if (deliverError) {
      revalidatePath(`/orders/${parsed.data.order_id}`);
      return {
        error: "Đã lưu khâu, nhưng trừ tồn kho thất bại: " + deliverError.message + " — cần kiểm tra tay.",
      };
    }
  }
  if (parsed.data.completed && parsed.data.task_type === "nhap_kho_bao_tri") {
    const { error: returnError } = await supabase.rpc("return_order_stock", {
      p_order_id: parsed.data.order_id,
    });
    if (returnError) {
      revalidatePath(`/orders/${parsed.data.order_id}`);
      return {
        error: "Đã lưu khâu, nhưng trả tồn kho thất bại: " + returnError.message + " — cần kiểm tra tay.",
      };
    }
  }

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { success: true };
}

// Bỏ tick 1 khâu đã hoàn thành — VD khách đổi ý sau khi đã chốt đơn/thu cọc,
// cần lùi đơn về đúng khâu đang dở. CEO yêu cầu 2026-08-06 (trước đó phải sửa
// tay qua DB, xem BQ12223). Giới hạn Giám đốc/Admin/Kế toán/Cửa hàng trưởng —
// hẹp hơn upsertOrderTask (ALL_ROLES) vì đây là thao tác SỬA LẠI lịch sử, có
// thể đụng tồn kho, không phải cập nhật tiến độ thường ngày của Kỹ thuật/Sales.
//
// Chỉ cho bỏ khâu CUỐI CÙNG đã hoàn thành (không có khâu nào SAU nó cũng
// "done") — giữ đúng tính tuần tự bắt buộc của upsertOrderTask, tránh tình
// huống khâu giữa chừng dở dang trong khi khâu sau vẫn báo xong.
export async function uncompleteOrderTask(orderId: string, taskType: TaskType) {
  await requireRole([...EQUIPMENT_WRITE_ROLES]);

  const supabase = await createClient();

  const { data: doneTasks, error: fetchError } = await supabase
    .from("order_tasks")
    .select("task_type")
    .eq("order_id", orderId)
    .not("completed_date", "is", null);
  if (fetchError) {
    throw new Error("Không thể đọc trạng thái khâu: " + fetchError.message);
  }

  const doneSet = new Set((doneTasks ?? []).map((t) => t.task_type));
  if (!doneSet.has(taskType)) {
    throw new Error("Khâu này chưa hoàn thành, không có gì để bỏ.");
  }

  const sequenceIndex = TASK_TYPE_SEQUENCE.indexOf(taskType);
  const laterDone = TASK_TYPE_SEQUENCE.slice(sequenceIndex + 1).find((stage) => doneSet.has(stage));
  if (laterDone) {
    throw new Error(
      `Phải bỏ hoàn thành khâu "${TASK_TYPE_LABELS[laterDone]}" trước (bỏ theo đúng thứ tự ngược lại).`,
    );
  }

  // Hoàn tác tồn kho TRƯỚC khi xoá completed_date — lỗi ở bước này thì dừng
  // lại luôn (không xoá completed_date), tránh đơn báo "chưa hoàn thành"
  // trong khi tồn kho vẫn y như lúc đã hoàn thành.
  if (taskType === "giao_hang_ban_giao") {
    const { error: undoError } = await supabase.rpc("undo_deliver_order_stock", { p_order_id: orderId });
    if (undoError) {
      throw new Error("Không thể hoàn tác trừ tồn kho: " + undoError.message);
    }
  }
  if (taskType === "nhap_kho_bao_tri") {
    const { error: undoError } = await supabase.rpc("undo_return_order_stock", { p_order_id: orderId });
    if (undoError) {
      throw new Error("Không thể hoàn tác trả tồn kho: " + undoError.message);
    }
  }

  const { error } = await supabase
    .from("order_tasks")
    .update({ completed_date: null })
    .eq("order_id", orderId)
    .eq("task_type", taskType);
  if (error) {
    throw new Error("Không thể bỏ hoàn thành khâu: " + error.message);
  }

  revalidatePath(`/orders/${orderId}`);
}
