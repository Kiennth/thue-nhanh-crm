"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, requireRole } from "@/lib/dal";
import { computeOrderLinePrice, type PricingTierInput } from "@/lib/rental-pricing";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";
import { ALL_ROLES, BRANCH_SCOPED_ROLES, EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { TRANSPORT_LINE_CATEGORY_BY_TYPE_ID } from "@/lib/commission";
import { formatVNDate, vnNow, vnTodayString } from "@/lib/vn-time";
import { splitTotalByWeights } from "@/lib/combo";
import { fetchAllRows, fetchAllRowsFast } from "@/lib/supabase/fetch-all";
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
    .select("id, product_type, tracking_type")
    .in("id", typeIds);
  const productTypeById = new Map((types ?? []).map((t) => [t.id, t.product_type]));
  // Dòng combo (dòng mẹ) luôn 0đ — tiền nằm ở dòng con, giảm giá rơi vào đó.
  const comboTypeIds = new Set(
    (types ?? []).filter((t) => t.tracking_type === "combo").map((t) => t.id),
  );

  const currentSum = round2(lineList.reduce((sum, l) => sum + l.line_total, 0));
  const diff = round2(currentSum - parsed.data.total_value);

  if (diff === 0) {
    return { success: true };
  }

  const eligible = lineList.filter(
    (l) =>
      l.equipment_type_id !== null &&
      productTypeById.get(l.equipment_type_id) === "rental" &&
      !comboTypeIds.has(l.equipment_type_id),
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
    .select("order_id, unit_price, equipment_instance_id, parent_line_id, line_total")
    .eq("id", lineId)
    .single();

  if (lineError || !line) {
    return { error: "Không tìm thấy dòng hàng." };
  }

  if (line.parent_line_id) {
    return { error: "Món trong combo — số lượng theo combo, không sửa riêng được." };
  }
  if (line.unit_price === 0 && line.line_total === 0) {
    const { count } = await supabase
      .from("order_equipment")
      .select("id", { count: "exact", head: true })
      .eq("parent_line_id", lineId);
    if (count) {
      return { error: "Combo không sửa số lượng được — xoá combo rồi thêm lại với số lượng mới." };
    }
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

// Sửa đơn giá cho CẢ NHÓM dòng serial đang gộp hiển thị (cùng sản phẩm, mỗi
// máy 1 dòng) — 1 lần nhập áp cho mọi máy trong nhóm.
export async function updateOrderEquipmentLinesPrice(
  lineIds: string[],
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OrderLinePriceSchema.safeParse({ unit_price: formData.get("unit_price") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  if (!lineIds.length) return { error: "Không có dòng hàng nào." };

  const supabase = await createClient();
  const { data: lines, error: linesError } = await supabase
    .from("order_equipment")
    .select("id, order_id, quantity")
    .in("id", lineIds);
  if (linesError || !lines?.length) {
    return { error: "Không tìm thấy dòng hàng." };
  }

  // Lần lượt từng dòng — song song thì trigger recalc_order_total đọc số cũ
  // của nhau, tổng đơn lệch.
  for (const line of lines) {
    const { error } = await supabase
      .from("order_equipment")
      .update({
        unit_price: parsed.data.unit_price,
        line_total: round2(parsed.data.unit_price * line.quantity),
      })
      .eq("id", line.id);
    if (error) return { error: "Không thể sửa đơn giá: " + error.message };
  }

  revalidatePath(`/orders/${lines[0].order_id}`);
  return { success: true };
}

// Xoá cả nhóm dòng serial đang gộp hiển thị.
export async function deleteOrderEquipmentLines(lineIds: string[]) {
  await requireRole([...ALL_ROLES]);
  if (!lineIds.length) return;

  const supabase = await createClient();
  const { data: first } = await supabase
    .from("order_equipment")
    .select("order_id")
    .eq("id", lineIds[0])
    .single();

  const { count: childCount } = await supabase
    .from("order_equipment")
    .select("id", { count: "exact", head: true })
    .in("id", lineIds)
    .not("parent_line_id", "is", null);
  if (childCount) {
    throw new Error('Có món nằm trong combo — dùng "Đổi món", hoặc xoá cả combo.');
  }

  const { error } = await supabase.from("order_equipment").delete().in("id", lineIds);
  if (error) {
    throw new Error("Không thể xoá dòng hàng: " + error.message);
  }
  if (first) revalidatePath(`/orders/${first.order_id}`);
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

const OrderLineExtraInfoSchema = z.object({
  extra_information: z.string().max(1000, { message: "Ghi chú tối đa 1.000 ký tự." }).optional(),
});

// Ghi chú hiển thị của dòng hàng — học Booqable "extra information" (CEO
// 2026-09-30): dòng nào cũng ghi được (phụ kiện đi kèm, địa chỉ + SĐT giao/
// thu hồi...), in ra chứng từ. Nhận nhiều id để nhóm máy serial đang gộp 1
// dòng dùng chung 1 ghi chú. Mọi nhân viên được ghi — giống Booqable, đây là
// thông tin vận hành chứ không đụng tới tiền.
export async function updateOrderLineExtraInfo(
  lineIds: string[],
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);

  const parsed = OrderLineExtraInfoSchema.safeParse({
    extra_information: formData.get("extra_information") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  if (!lineIds.length) return { error: "Không có dòng hàng nào." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_equipment")
    .update({ extra_information: parsed.data.extra_information?.trim() || null })
    .in("id", lineIds)
    .select("order_id");
  if (error) {
    return { error: "Không thể lưu ghi chú: " + error.message };
  }

  if (data?.[0]) revalidatePath(`/orders/${data[0].order_id}`);
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
    .select(
      "id, equipment_type_id, equipment_unit_id, equipment_instance_id, quantity, parent_line_id, charge_duration",
    )
    .eq("order_id", id);

  const period = {
    rentalStartAt: parsed.data.rental_start_at,
    rentalEndAt: parsed.data.rental_end_at,
  };
  for (const line of lines ?? []) {
    if (!line.equipment_type_id) continue; // dòng tự do — giá do người nhập tự gõ, không tính lại
    // Dòng con combo không tự tính giá — nhận phần chia từ dòng combo bên dưới.
    if (line.parent_line_id) continue;
    if ((lines ?? []).some((l) => l.parent_line_id === line.id)) {
      const comboError = await repriceComboLine(
        supabase,
        { id: line.id, equipment_type_id: line.equipment_type_id, quantity: line.quantity },
        { ...period, durationOverride: line.charge_duration },
      );
      if (comboError) return { error: "Không tính lại được giá combo: " + comboError };
      continue;
    }

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
      // Dòng đã sửa tay số kỳ tính tiền giữ nguyên số kỳ đó khi đổi lịch.
      line.charge_duration,
    );
    if (equipmentType.product_type !== "rental" || equipmentType.tracking_type === "combo") continue;

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
      "id, parent_line_id, equipment_type_id, custom_name, equipment_unit_id, equipment_instance_id, quantity, unit_price, line_total, charge_duration, extra_information",
    )
    .eq("order_id", id)
    .order("position");

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
    const copyOf = (line: (typeof sourceLines)[number]) => ({
      order_id: newOrder.id,
      equipment_type_id: line.equipment_type_id,
      custom_name: line.custom_name,
      equipment_unit_id: line.equipment_unit_id,
      equipment_instance_id: line.equipment_instance_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
      charge_duration: line.charge_duration,
      extra_information: line.extra_information,
    });
    // Dòng thường + dòng combo trước, rồi mới tới món con (trỏ về id dòng
    // combo MỚI) — giữ nguyên cấu trúc combo ở đơn nhân bản.
    const topLevel = sourceLines.filter((l) => !l.parent_line_id);
    const { data: inserted, error: copyError } = await supabase
      .from("order_equipment")
      .insert(topLevel.map(copyOf))
      .select("id");
    if (copyError || !inserted) {
      return { error: "Đã tạo đơn nháp nhưng copy dòng hàng lỗi: " + (copyError?.message ?? "") };
    }
    const newIdByOldId = new Map(topLevel.map((l, i) => [l.id, inserted[i]?.id]));
    const children = sourceLines.filter((l) => l.parent_line_id);
    if (children.length) {
      const { error: childError } = await supabase.from("order_equipment").insert(
        children.map((l) => ({
          ...copyOf(l),
          parent_line_id: newIdByOldId.get(l.parent_line_id!) ?? null,
        })),
      );
      if (childError) {
        return { error: "Đã tạo đơn nháp nhưng copy món trong combo lỗi: " + childError.message };
      }
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
      "name, product_type, tracking_type, pricing_method, price, rental_period_unit, pricing_template_id, default_extra_information",
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
  // Số kỳ tính tiền sửa tay trên dòng (charge_duration) — null = theo đơn.
  durationOverride?: number | null,
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
    durationOverride,
  });
}

async function computeLineForEquipmentType(
  supabase: SupabaseServerClient,
  equipmentTypeId: string,
  rentalStartAt: string | null,
  rentalEndAt: string | null,
  quantity: number,
  unitPriceOverride?: number | null,
  durationOverride?: number | null,
) {
  const { equipmentType, tiers } = await fetchEquipmentTypeForPricing(supabase, equipmentTypeId);
  const computed = computeLinePrice(
    equipmentType,
    tiers,
    rentalStartAt,
    rentalEndAt,
    quantity,
    unitPriceOverride,
    durationOverride,
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

// ---------------------------------------------------------------------------
// Combo (CEO 2026-09-26) — dòng mẹ 0đ + dòng con cho từng món. Tiền combo chia
// cho dòng con theo tỉ lệ giá thuê lẻ (CEO chọn phương án b) để tổng đơn và
// báo cáo doanh thu theo thiết bị tự đúng.
// ---------------------------------------------------------------------------

// durationOverride = số kỳ tính tiền sửa tay của dòng combo (charge_duration)
// — áp cho cả giá combo lẫn trọng số chia xuống món con.
type RentalPeriod = {
  rentalStartAt: string | null;
  rentalEndAt: string | null;
  durationOverride?: number | null;
};

// Giá thuê lẻ của từng dòng con (loại hàng × SL) cho cùng khung thuê — trọng
// số chia tiền combo. Loại hàng không tính được giá thì trọng số 0.
async function componentListTotals(
  supabase: SupabaseServerClient,
  items: { typeId: string; quantity: number }[],
  period: RentalPeriod,
): Promise<number[]> {
  const pricingByType = new Map<string, Awaited<ReturnType<typeof fetchEquipmentTypeForPricing>>>();
  const totals: number[] = [];
  for (const item of items) {
    try {
      let pricing = pricingByType.get(item.typeId);
      if (!pricing) {
        pricing = await fetchEquipmentTypeForPricing(supabase, item.typeId);
        pricingByType.set(item.typeId, pricing);
      }
      totals.push(
        computeLinePrice(
          pricing.equipmentType,
          pricing.tiers,
          period.rentalStartAt,
          period.rentalEndAt,
          item.quantity,
          null,
          period.durationOverride,
        ).lineTotal,
      );
    } catch {
      totals.push(0);
    }
  }
  return totals;
}

// Chia lại tổng tiền 1 combo xuống các dòng con hiện có.
async function allocateComboTotal(
  supabase: SupabaseServerClient,
  children: { id: string; equipment_type_id: string | null; quantity: number }[],
  total: number,
  period: RentalPeriod,
): Promise<string | null> {
  if (!children.length) return null;
  const weights = await componentListTotals(
    supabase,
    children.map((c) => ({ typeId: c.equipment_type_id ?? "", quantity: c.quantity })),
    period,
  );
  const shares = splitTotalByWeights(total, weights);
  // Cập nhật LẦN LƯỢT, không Promise.all: mỗi UPDATE kích trigger
  // recalc_order_total cộng lại tổng đơn — chạy song song thì các trigger đọc
  // số cũ của nhau và orders.total_value lệch (gặp khi test 2026-09-26).
  for (const [i, c] of children.entries()) {
    const { error } = await supabase
      .from("order_equipment")
      .update({ unit_price: round2(shares[i] / c.quantity), line_total: shares[i] })
      .eq("id", c.id);
    if (error) return error.message;
  }
  return null;
}

// Máy sẵn có của 1 loại hàng tại kho, bỏ máy đang nằm trên đơn CHƯA ĐÓNG
// (status vẫn "available" tới lúc giao nên phải lọc tay — bài học mapper
// 2026-09-24 lấy trùng máy).
async function pickAvailableInstances(
  supabase: SupabaseServerClient,
  typeId: string,
  branchId: string,
  count: number,
  exclude: Set<string>,
): Promise<string[]> {
  if (count <= 0) return [];
  const { data: candidates } = await supabase
    .from("equipment_instances")
    .select("id, identifier_code")
    .eq("equipment_type_id", typeId)
    .eq("branch_id", branchId)
    .eq("status", "available")
    .order("identifier_code");
  const candidateIds = (candidates ?? []).map((c) => c.id).filter((cid) => !exclude.has(cid));
  if (!candidateIds.length) return [];

  const { data: busyRows } = await supabase
    .from("order_equipment")
    .select("equipment_instance_id, orders!inner(completed_at, cancelled_at)")
    .in("equipment_instance_id", candidateIds)
    .is("orders.completed_at", null)
    .is("orders.cancelled_at", null);
  const busy = new Set(
    ((busyRows ?? []) as unknown as { equipment_instance_id: string | null }[]).map(
      (r) => r.equipment_instance_id,
    ),
  );
  // Máy serial thật trước, mã tạm AUTO-* sau — cùng thứ tự ưu tiên mapper.
  const free = (candidates ?? []).filter((c) => candidateIds.includes(c.id) && !busy.has(c.id));
  free.sort(
    (a, b) =>
      Number(a.identifier_code.startsWith("AUTO")) - Number(b.identifier_code.startsWith("AUTO")),
  );
  return free.slice(0, count).map((c) => c.id);
}

// Hàng theo số lượng còn trống thật tại kho giao cho khung thuê của đơn: tồn
// "trong kho" trừ nhu cầu các đơn chưa giao, cùng kho, trùng lịch (cùng cách
// tính cảnh báo thiếu hàng trên trang đơn). Trả từng biến thể, nhiều trước.
async function availableQuantityUnits(
  supabase: SupabaseServerClient,
  typeId: string,
  branchId: string,
  period: RentalPeriod,
  taken: Map<string, number>,
): Promise<{ unitId: string; available: number }[]> {
  const { data: units } = await supabase
    .from("equipment_units")
    .select("id")
    .eq("equipment_type_id", typeId);
  const unitIds = (units ?? []).map((u) => u.id);
  if (!unitIds.length) return [];

  const [{ data: stock }, { data: demandRows }] = await Promise.all([
    supabase
      .from("equipment_stock")
      .select("equipment_unit_id, quantity_in_stock")
      .eq("branch_id", branchId)
      .in("equipment_unit_id", unitIds),
    supabase
      .from("order_equipment")
      .select(
        "equipment_unit_id, quantity, orders!inner(completed_at, cancelled_at, delivery_stock_moved_at, pickup_branch_id, rental_start_at, rental_end_at)",
      )
      .in("equipment_unit_id", unitIds)
      .is("orders.completed_at", null)
      .is("orders.cancelled_at", null)
      .is("orders.delivery_stock_moved_at", null)
      .eq("orders.pickup_branch_id", branchId),
  ]);

  const overlaps = (start: string | null, end: string | null) =>
    !period.rentalStartAt ||
    !period.rentalEndAt ||
    !start ||
    !end ||
    (new Date(start) < new Date(period.rentalEndAt) && new Date(period.rentalStartAt) < new Date(end));
  const demandByUnit = new Map<string, number>();
  for (const row of (demandRows ?? []) as unknown as {
    equipment_unit_id: string;
    quantity: number;
    orders: { rental_start_at: string | null; rental_end_at: string | null };
  }[]) {
    if (!overlaps(row.orders.rental_start_at, row.orders.rental_end_at)) continue;
    demandByUnit.set(row.equipment_unit_id, (demandByUnit.get(row.equipment_unit_id) ?? 0) + row.quantity);
  }

  return unitIds
    .map((unitId) => ({
      unitId,
      available:
        (stock?.find((st) => st.equipment_unit_id === unitId)?.quantity_in_stock ?? 0) -
        (demandByUnit.get(unitId) ?? 0) -
        (taken.get(unitId) ?? 0),
    }))
    .filter((u) => u.available > 0)
    .sort((a, b) => b.available - a.available);
}

// Biến thể cho món con theo số lượng: 1 biến thể thì dùng, chưa có thì tạo
// biến thể mặc định, nhiều biến thể thì lấy biến thể còn nhiều hàng nhất tại
// kho giao (nhân viên đổi lại được bằng nút "Đổi món").
async function resolveComponentUnit(
  supabase: SupabaseServerClient,
  typeId: string,
  branchId: string,
): Promise<string | null> {
  const { data: units } = await supabase
    .from("equipment_units")
    .select("id")
    .eq("equipment_type_id", typeId);
  if (units && units.length === 1) return units[0].id;
  if (!units?.length) {
    const { data: newUnitId } = await supabase.rpc("ensure_default_equipment_unit", {
      p_equipment_type_id: typeId,
    });
    return newUnitId ?? null;
  }
  const { data: stock } = await supabase
    .from("equipment_stock")
    .select("equipment_unit_id, quantity_in_stock")
    .eq("branch_id", branchId)
    .in(
      "equipment_unit_id",
      units.map((u) => u.id),
    );
  const best = [...(stock ?? [])].sort((a, b) => b.quantity_in_stock - a.quantity_in_stock)[0];
  return best?.equipment_unit_id ?? units[0].id;
}

// Thêm N bộ combo vào đơn: kiểm đủ hàng từng món trước, rồi tạo dòng mẹ + dòng
// con (máy serial thì mỗi máy 1 dòng) và chia tiền combo xuống dòng con.
async function addComboLines(
  supabase: SupabaseServerClient,
  order: { id: string; pickup_branch_id: string } & RentalPeriod,
  combo: {
    id: string;
    equipmentType: Awaited<ReturnType<typeof fetchEquipmentTypeForPricing>>["equipmentType"];
    tiers: PricingTierInput[];
  },
  quantity: number,
): Promise<ActionState> {
  const { data: components } = await supabase
    .from("equipment_type_components")
    .select("id, component_type_id, quantity")
    .eq("combo_type_id", combo.id)
    .order("position");
  if (!components?.length) {
    return {
      error: `Combo "${combo.equipmentType.name}" chưa khai báo món con — vào trang sản phẩm, mục "Thành phần combo" để thêm trước.`,
    };
  }

  // Món thay thế (vd "Zoom H4N hoặc H4N Pro hoặc H6") — xếp sau món chính
  // theo thứ tự ưu tiên đã khai.
  const { data: alternatives } = await supabase
    .from("equipment_type_component_alternatives")
    .select("component_id, alternative_type_id, position")
    .in(
      "component_id",
      components.map((c) => c.id),
    )
    .order("position");
  const candidatesByComponent = new Map(
    components.map((c) => [
      c.id,
      [
        c.component_type_id,
        ...(alternatives ?? [])
          .filter((a) => a.component_id === c.id)
          .map((a) => a.alternative_type_id),
      ],
    ]),
  );

  const { data: componentTypes } = await supabase
    .from("equipment_types")
    .select("id, name, product_type, tracking_type, default_extra_information")
    .in("id", [...new Set([...candidatesByComponent.values()].flat())]);
  const componentTypeById = new Map((componentTypes ?? []).map((t) => [t.id, t]));

  const { data: existing } = await supabase
    .from("order_equipment")
    .select("equipment_instance_id")
    .eq("order_id", order.id)
    .not("equipment_instance_id", "is", null);
  const taken = new Set((existing ?? []).map((l) => l.equipment_instance_id!));
  const takenUnits = new Map<string, number>();

  const childSpecs: {
    equipment_type_id: string;
    equipment_unit_id: string | null;
    equipment_instance_id: string | null;
    quantity: number;
  }[] = [];
  const shortages: string[] = [];
  for (const component of components) {
    const candidateIds = candidatesByComponent.get(component.id) ?? [component.component_type_id];
    let remaining = component.quantity * quantity;

    // Lần lượt từng lựa chọn theo ưu tiên, lấy phần còn trống thật.
    for (const typeId of candidateIds) {
      if (remaining <= 0) break;
      const type = componentTypeById.get(typeId);
      if (!type) continue;
      if (type.tracking_type === "individual") {
        const ids = await pickAvailableInstances(supabase, type.id, order.pickup_branch_id, remaining, taken);
        for (const iid of ids) {
          taken.add(iid);
          childSpecs.push({
            equipment_type_id: type.id,
            equipment_unit_id: null,
            equipment_instance_id: iid,
            quantity: 1,
          });
        }
        remaining -= ids.length;
      } else if (type.tracking_type === "quantity") {
        const units = await availableQuantityUnits(
          supabase,
          type.id,
          order.pickup_branch_id,
          order,
          takenUnits,
        );
        for (const unit of units) {
          if (remaining <= 0) break;
          const take = Math.min(unit.available, remaining);
          takenUnits.set(unit.unitId, (takenUnits.get(unit.unitId) ?? 0) + take);
          childSpecs.push({
            equipment_type_id: type.id,
            equipment_unit_id: unit.unitId,
            equipment_instance_id: null,
            quantity: take,
          });
          remaining -= take;
        }
      }
    }

    if (remaining > 0) {
      // Hết sạch mọi lựa chọn: món chính theo số lượng vẫn cho thêm (trang đơn
      // hiện cảnh báo "thiếu" như dòng thường); máy serial thì phải có máy thật.
      const primary = componentTypeById.get(candidateIds[0]);
      if (primary?.tracking_type === "quantity") {
        const unitId = await resolveComponentUnit(supabase, primary.id, order.pickup_branch_id);
        if (unitId) {
          childSpecs.push({
            equipment_type_id: primary.id,
            equipment_unit_id: unitId,
            equipment_instance_id: null,
            quantity: remaining,
          });
          remaining = 0;
        }
      }
      if (remaining > 0) {
        const names = candidateIds.map((cid) => componentTypeById.get(cid)?.name ?? "—").join(" / ");
        shortages.push(`${names} (thiếu ${remaining} máy trống)`);
      }
    }
  }
  if (shortages.length) {
    return {
      error: `Kho giao không đủ máy trống cho combo: ${shortages.join("; ")}. Bổ sung/điều chuyển máy rồi thêm lại.`,
    };
  }

  let comboTotal: number;
  try {
    comboTotal = computeLinePrice(
      combo.equipmentType,
      combo.tiers,
      order.rentalStartAt,
      order.rentalEndAt,
      quantity,
    ).lineTotal;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tính được giá combo." };
  }

  const { data: parent, error: parentError } = await supabase
    .from("order_equipment")
    .insert({
      order_id: order.id,
      equipment_type_id: combo.id,
      quantity,
      unit_price: 0,
      line_total: 0,
      extra_information: combo.equipmentType.default_extra_information,
    })
    .select("id")
    .single();
  if (parentError || !parent) {
    return { error: "Không thể thêm combo: " + (parentError?.message ?? "") };
  }

  const weights = await componentListTotals(
    supabase,
    childSpecs.map((c) => ({ typeId: c.equipment_type_id, quantity: c.quantity })),
    order,
  );
  const shares = splitTotalByWeights(comboTotal, weights);
  const { error: childError } = await supabase.from("order_equipment").insert(
    childSpecs.map((c, i) => ({
      ...c,
      order_id: order.id,
      parent_line_id: parent.id,
      extra_information: componentTypeById.get(c.equipment_type_id)?.default_extra_information ?? null,
      unit_price: round2(shares[i] / c.quantity),
      line_total: shares[i],
    })),
  );
  if (childError) {
    await supabase.from("order_equipment").delete().eq("id", parent.id);
    return { error: "Không thể thêm món trong combo: " + childError.message };
  }

  return { success: true };
}

// Đổi thời gian thuê / sửa giá combo: tính lại tổng combo rồi chia lại.
async function repriceComboLine(
  supabase: SupabaseServerClient,
  parent: { id: string; equipment_type_id: string; quantity: number },
  period: RentalPeriod,
  totalOverride?: number,
): Promise<string | null> {
  let total = totalOverride;
  if (total === undefined) {
    try {
      const { computed } = await computeLineForEquipmentType(
        supabase,
        parent.equipment_type_id,
        period.rentalStartAt,
        period.rentalEndAt,
        parent.quantity,
        null,
        period.durationOverride,
      );
      total = computed.lineTotal;
    } catch (e) {
      return e instanceof Error ? e.message : "Không tính được giá combo.";
    }
  }
  const { data: children } = await supabase
    .from("order_equipment")
    .select("id, equipment_type_id, quantity")
    .eq("parent_line_id", parent.id);
  return allocateComboTotal(supabase, children ?? [], total, period);
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
  const error = await insertEquipmentLine(supabase, parsed.data.order_id, {
    typeId: parsed.data.equipment_type_id,
    unitId: parsed.data.equipment_unit_id ?? null,
    instanceId: parsed.data.equipment_instance_id ?? null,
    quantity: parsed.data.quantity,
  });

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return error ? { error } : { success: true };
}

// Lõi thêm 1 lựa chọn hàng vào đơn — dùng chung cho ô thêm nhanh trên trang
// đơn và popup "Tạo đơn nhanh". Trả về thông báo lỗi (null = ổn).
//
// Hàng serial KHÔNG chỉ định máy (CEO 2026-10-03, phương án B): nhập số
// lượng, hệ thống tự lấy đủ máy đang rảnh tại kho giao (serial thật trước,
// mã AUTO sau, bỏ máy đang nằm trên đơn chưa đóng), mỗi máy 1 dòng như cũ —
// đổi máy khác được ở trang đơn. Thiếu máy thì vẫn thêm số máy có và báo rõ
// thiếu bao nhiêu.
async function insertEquipmentLine(
  supabase: SupabaseServerClient,
  orderId: string,
  item: { typeId: string; unitId: string | null; instanceId: string | null; quantity: number },
): Promise<string | null> {
  const { data: order } = await supabase
    .from("orders")
    .select("rental_start_at, rental_end_at, pickup_branch_id")
    .eq("id", orderId)
    .single();

  let equipmentType;
  let tiers;
  try {
    ({ equipmentType, tiers } = await fetchEquipmentTypeForPricing(supabase, item.typeId));
  } catch (e) {
    return e instanceof Error ? e.message : "Không tính được giá dòng hàng.";
  }

  if (equipmentType.product_type === "rental" && (!order?.rental_start_at || !order?.rental_end_at)) {
    return 'Đơn chưa có thời gian thuê — điền "Bắt đầu thuê / Kết thúc thuê" và bấm "Lưu thời gian thuê" trước, rồi thêm hàng.';
  }

  if (equipmentType.tracking_type === "combo") {
    const result = await addComboLines(
      supabase,
      {
        id: orderId,
        pickup_branch_id: order!.pickup_branch_id,
        rentalStartAt: order!.rental_start_at,
        rentalEndAt: order!.rental_end_at,
      },
      { id: item.typeId, equipmentType, tiers },
      item.quantity,
    );
    return result && "error" in result ? result.error : null;
  }

  // Hàng serial chưa chỉ định máy → tự chọn máy rảnh rồi thêm từng máy.
  if (
    equipmentType.product_type === "rental" &&
    equipmentType.tracking_type === "individual" &&
    !item.instanceId
  ) {
    const { data: existing } = await supabase
      .from("order_equipment")
      .select("equipment_instance_id")
      .eq("order_id", orderId)
      .not("equipment_instance_id", "is", null);
    const taken = new Set((existing ?? []).map((l) => l.equipment_instance_id!));
    const picked = await pickAvailableInstances(
      supabase,
      item.typeId,
      order!.pickup_branch_id,
      item.quantity,
      taken,
    );
    for (const instanceId of picked) {
      const error = await insertEquipmentLine(supabase, orderId, {
        typeId: item.typeId,
        unitId: null,
        instanceId,
        quantity: 1,
      });
      if (error) return error;
    }
    if (picked.length < item.quantity) {
      return picked.length
        ? `${equipmentType.name}: kho giao chỉ còn ${picked.length}/${item.quantity} máy trống — đã thêm ${picked.length} máy, thiếu ${item.quantity - picked.length}.`
        : `${equipmentType.name}: kho giao không còn máy trống — chưa thêm được máy nào.`;
    }
    return null;
  }

  // Hàng bán/cho thuê theo số lượng bắt buộc gắn biến thể (tồn kho bám theo
  // equipment_units — trigger check_order_equipment_line chặn nếu thiếu).
  // Đa số loại hàng thực tế chỉ có 0-1 biến thể nên client không bắt chọn
  // nữa: 1 biến thể thì tự dùng, CHƯA có thì tự tạo ngầm biến thể mặc định
  // trùng tên sản phẩm — qua admin client vì RLS chỉ cho Giám đốc/Admin/Kế
  // toán ghi equipment_units, còn đây là ghi sổ hệ thống, an toàn cho mọi
  // role được phép thêm dòng hàng.
  let equipmentUnitId = item.unitId;
  const needsUnit =
    equipmentType.product_type === "sale" ||
    (equipmentType.product_type === "rental" && equipmentType.tracking_type === "quantity");
  if (needsUnit && !equipmentUnitId) {
    const { data: units } = await supabase
      .from("equipment_units")
      .select("id")
      .eq("equipment_type_id", item.typeId);
    if (units && units.length === 1) {
      equipmentUnitId = units[0].id;
    } else if (units && units.length > 1) {
      return `${equipmentType.name} có nhiều biến thể — vui lòng chọn biến thể cụ thể.`;
    } else {
      // RPC security definer (không phải admin client) — xem ghi chú trong
      // migration 20260802020000: import @supabase/supabase-js thuần vào
      // orders.ts từng làm sập Worker (eval bị Cloudflare chặn ngay lúc nạp
      // module, trước khi code chạy tới).
      const { data: newUnitId, error: unitError } = await supabase.rpc(
        "ensure_default_equipment_unit",
        { p_equipment_type_id: item.typeId },
      );
      if (unitError || !newUnitId) {
        return "Không tạo được biến thể mặc định cho loại hàng này: " + (unitError?.message ?? "");
      }
      equipmentUnitId = newUnitId;
    }
  }

  // Tra giá riêng biến thể SAU khi đã biết chắc equipmentUnitId (biến thể
  // chọn thẳng, biến thể duy nhất tự dùng, hay biến thể mặc định vừa tạo) —
  // null nếu biến thể không có giá riêng, khi đó computeLinePrice tự rơi về
  // giá chung equipmentType.price như trước giờ.
  const unitPriceOverride = await resolveUnitPriceOverride(supabase, equipmentUnitId, item.instanceId);

  let computed;
  try {
    computed = computeLinePrice(
      equipmentType,
      tiers,
      order?.rental_start_at ?? null,
      order?.rental_end_at ?? null,
      item.quantity,
      unitPriceOverride,
    );
  } catch (e) {
    return e instanceof Error ? e.message : "Không tính được giá dòng hàng.";
  }

  const { error } = await supabase.from("order_equipment").insert({
    order_id: orderId,
    equipment_type_id: item.typeId,
    equipment_unit_id: equipmentUnitId,
    equipment_instance_id: item.instanceId,
    quantity: item.quantity,
    unit_price: computed.unitPrice,
    line_total: computed.lineTotal,
    // Ghi chú mặc định của sản phẩm (vd "Kèm Remote | Dây nguồn").
    extra_information: equipmentType.default_extra_information,
  });

  return error ? "Không thể thêm dòng hàng: " + error.message : null;
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
    .select("order_id, parent_line_id")
    .eq("id", id)
    .single();

  if (line?.parent_line_id) {
    throw new Error('Món nằm trong combo — dùng "Đổi món", hoặc xoá cả combo.');
  }

  const { error } = await supabase.from("order_equipment").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá dòng hàng: " + error.message);
  }

  if (line) {
    revalidatePath(`/orders/${line.order_id}`);
  }
}

// Sửa giá 1 bộ combo trên đơn — tổng mới chia lại xuống các món con theo tỉ
// lệ giá lẻ (giống lúc thêm combo).
export async function updateComboLinePrice(
  parentLineId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = OrderLinePriceSchema.safeParse({ unit_price: formData.get("unit_price") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("order_equipment")
    .select("id, order_id, equipment_type_id, quantity, charge_duration, orders(rental_start_at, rental_end_at)")
    .eq("id", parentLineId)
    .single();
  if (!parent?.equipment_type_id) return { error: "Không tìm thấy dòng combo." };
  const orderPeriod = parent.orders as unknown as {
    rental_start_at: string | null;
    rental_end_at: string | null;
  } | null;

  const error = await repriceComboLine(
    supabase,
    { id: parent.id, equipment_type_id: parent.equipment_type_id, quantity: parent.quantity },
    {
      rentalStartAt: orderPeriod?.rental_start_at ?? null,
      rentalEndAt: orderPeriod?.rental_end_at ?? null,
      durationOverride: parent.charge_duration,
    },
    round2(parsed.data.unit_price * parent.quantity),
  );
  if (error) return { error: "Không thể sửa giá combo: " + error };

  revalidatePath(`/orders/${parent.order_id}`);
  return { success: true };
}

const ChargeDurationSchema = z.object({
  // Bỏ trống = về lại số kỳ tự tính theo thời gian thuê của đơn.
  charge_duration: z.union([
    z.literal(""),
    z.coerce.number().positive({ message: "Số kỳ tính tiền phải lớn hơn 0." }).max(9999),
  ]),
});

// Sửa số kỳ tính tiền của dòng (CEO 2026-09-26, học Booqable "charge length"):
// khách cầm 5 ngày nhưng chỉ tính 3 ngày. Đơn giá tính lại từ giá gốc × số kỳ
// mới (xét cả bậc giảm theo số kỳ đó); nhận nhiều id để áp 1 lần cho nhóm máy
// serial đang gộp. Dòng combo thì tính lại giá combo rồi chia lại món con.
export async function updateOrderLineChargeDuration(
  lineIds: string[],
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = ChargeDurationSchema.safeParse({ charge_duration: formData.get("charge_duration") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  const chargeDuration = parsed.data.charge_duration === "" ? null : parsed.data.charge_duration;
  if (!lineIds.length) return { error: "Không có dòng hàng nào." };

  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("order_equipment")
    .select(
      "id, order_id, parent_line_id, equipment_type_id, equipment_unit_id, equipment_instance_id, quantity, orders(rental_start_at, rental_end_at)",
    )
    .in("id", lineIds);
  if (!lines?.length) return { error: "Không tìm thấy dòng hàng." };

  for (const line of lines) {
    if (!line.equipment_type_id || line.parent_line_id) continue;
    const orderPeriod = line.orders as unknown as {
      rental_start_at: string | null;
      rental_end_at: string | null;
    } | null;
    const period = {
      rentalStartAt: orderPeriod?.rental_start_at ?? null,
      rentalEndAt: orderPeriod?.rental_end_at ?? null,
      durationOverride: chargeDuration,
    };

    const { data: childCheck } = await supabase
      .from("order_equipment")
      .select("id")
      .eq("parent_line_id", line.id)
      .limit(1);
    if (childCheck?.length) {
      const { error } = await supabase
        .from("order_equipment")
        .update({ charge_duration: chargeDuration })
        .eq("id", line.id);
      if (error) return { error: "Không lưu được số kỳ tính tiền: " + error.message };
      const comboError = await repriceComboLine(
        supabase,
        { id: line.id, equipment_type_id: line.equipment_type_id, quantity: line.quantity },
        period,
      );
      if (comboError) return { error: "Không tính lại được giá combo: " + comboError };
      continue;
    }

    let computed;
    let productType;
    try {
      const unitPriceOverride = await resolveUnitPriceOverride(
        supabase,
        line.equipment_unit_id,
        line.equipment_instance_id,
      );
      const result = await computeLineForEquipmentType(
        supabase,
        line.equipment_type_id,
        period.rentalStartAt,
        period.rentalEndAt,
        line.quantity,
        unitPriceOverride,
        chargeDuration,
      );
      computed = result.computed;
      productType = result.equipmentType.product_type;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Không tính được giá dòng hàng." };
    }
    if (productType !== "rental") {
      return { error: "Chỉ hàng cho thuê mới có số kỳ tính tiền." };
    }

    // Lần lượt từng dòng — song song thì trigger tổng đơn đọc số cũ của nhau.
    const { error } = await supabase
      .from("order_equipment")
      .update({
        charge_duration: chargeDuration,
        unit_price: computed.unitPrice,
        line_total: computed.lineTotal,
      })
      .eq("id", line.id);
    if (error) return { error: "Không lưu được số kỳ tính tiền: " + error.message };
  }

  revalidatePath(`/orders/${lines[0].order_id}`);
  return { success: true };
}

export interface ComboSwapOption {
  key: string;
  label: string;
  equipmentTypeId: string;
  equipmentUnitId?: string;
  equipmentInstanceId?: string;
}

// Danh sách hàng để đổi 1 món trong combo: mọi hàng cho thuê (trừ combo) —
// máy serial thì chỉ máy sẵn có tại kho giao của đơn. Tải khi mở hộp thoại
// "Đổi món", không nhồi sẵn vào trang đơn.
export async function getComboSwapOptions(childLineId: string): Promise<ComboSwapOption[]> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("order_equipment")
    .select("order_id, orders(pickup_branch_id)")
    .eq("id", childLineId)
    .single();
  const branchId = (child?.orders as unknown as { pickup_branch_id: string } | null)?.pickup_branch_id;
  if (!branchId) return [];

  const [{ data: types }, { data: units }, { data: instances }] = await Promise.all([
    supabase
      .from("equipment_types")
      .select("id, name, tracking_type")
      .eq("product_type", "rental")
      .in("tracking_type", ["individual", "quantity"])
      .order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model"),
    supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, identifier_code")
      .eq("branch_id", branchId)
      .eq("status", "available")
      .order("identifier_code"),
  ]);

  const unitsByType = new Map<string, { id: string; brand_model: string }[]>();
  for (const u of units ?? []) {
    unitsByType.set(u.equipment_type_id, [...(unitsByType.get(u.equipment_type_id) ?? []), u]);
  }
  const instancesByType = new Map<string, { id: string; identifier_code: string }[]>();
  for (const i of instances ?? []) {
    instancesByType.set(i.equipment_type_id, [...(instancesByType.get(i.equipment_type_id) ?? []), i]);
  }

  return (types ?? []).flatMap((t): ComboSwapOption[] => {
    if (t.tracking_type === "individual") {
      return (instancesByType.get(t.id) ?? []).map((i) => ({
        key: `i-${i.id}`,
        label: `${t.name} — ${i.identifier_code}`,
        equipmentTypeId: t.id,
        equipmentInstanceId: i.id,
      }));
    }
    const typeUnits = unitsByType.get(t.id) ?? [];
    if (typeUnits.length > 1) {
      return typeUnits.map((u) => ({
        key: `u-${u.id}`,
        label: `${t.name} — ${u.brand_model}`,
        equipmentTypeId: t.id,
        equipmentUnitId: u.id,
      }));
    }
    return [{ key: `t-${t.id}`, label: t.name, equipmentTypeId: t.id }];
  });
}

// Đổi 1 món trong combo (CEO 2026-09-26 cho phép) — vd hết Zoom H1N thì thay
// Zoom H4n. Phần doanh thu của món cũ chuyển nguyên sang món mới; ghi chú dòng
// lưu ai đổi, đổi từ gì sang gì.
export async function swapComboChild(
  childLineId: string,
  option: { equipmentTypeId: string; equipmentUnitId?: string; equipmentInstanceId?: string },
): Promise<ActionState> {
  const employee = await requireRole([...ALL_ROLES]);
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("order_equipment")
    .select(
      "id, order_id, parent_line_id, equipment_type_id, equipment_unit_id, equipment_instance_id, quantity, line_total, note, orders(pickup_branch_id)",
    )
    .eq("id", childLineId)
    .single();
  if (!child?.parent_line_id) return { error: "Dòng này không nằm trong combo." };
  const branchId = (child.orders as unknown as { pickup_branch_id: string } | null)?.pickup_branch_id;
  if (!branchId) return { error: "Không tìm thấy kho giao của đơn." };

  const [{ data: newType }, { data: oldType }] = await Promise.all([
    supabase
      .from("equipment_types")
      .select("id, name, product_type, tracking_type")
      .eq("id", option.equipmentTypeId)
      .single(),
    supabase
      .from("equipment_types")
      .select("name")
      .eq("id", child.equipment_type_id ?? "")
      .maybeSingle(),
  ]);
  if (
    !newType ||
    newType.product_type !== "rental" ||
    (newType.tracking_type !== "individual" && newType.tracking_type !== "quantity")
  ) {
    return { error: "Chỉ đổi sang hàng cho thuê (máy serial hoặc theo số lượng)." };
  }

  const describe = async (unitId: string | null, instanceId: string | null) => {
    if (instanceId) {
      const { data } = await supabase
        .from("equipment_instances")
        .select("identifier_code")
        .eq("id", instanceId)
        .maybeSingle();
      return data?.identifier_code ?? "";
    }
    if (unitId) {
      const { data } = await supabase
        .from("equipment_units")
        .select("brand_model")
        .eq("id", unitId)
        .maybeSingle();
      return data?.brand_model ?? "";
    }
    return "";
  };
  const oldDetail = await describe(child.equipment_unit_id, child.equipment_instance_id);
  // Biến thể mặc định trùng tên sản phẩm thì không lặp lại trong ghi chú.
  const labelOf = (name: string, detail: string) =>
    detail && detail !== name ? `${name} ${detail}` : name;
  const oldLabel = labelOf(oldType?.name ?? "—", oldDetail);

  let rows: { unitId: string | null; instanceId: string | null; quantity: number }[];
  if (newType.tracking_type === "individual") {
    if (!option.equipmentInstanceId) return { error: "Chọn máy cụ thể để đổi." };
    // Dòng cũ theo số lượng (vd 3 cái) đổi sang máy serial: máy đã chọn + tự
    // bốc thêm cho đủ số lượng.
    const extra = await pickAvailableInstances(
      supabase,
      newType.id,
      branchId,
      child.quantity - 1,
      new Set([option.equipmentInstanceId]),
    );
    if (extra.length < child.quantity - 1) {
      return { error: `Kho giao chỉ còn ${extra.length + 1} máy ${newType.name} trống, cần ${child.quantity}.` };
    }
    rows = [option.equipmentInstanceId, ...extra].map((iid) => ({
      unitId: null,
      instanceId: iid,
      quantity: 1,
    }));
  } else {
    const unitId =
      option.equipmentUnitId ?? (await resolveComponentUnit(supabase, newType.id, branchId));
    if (!unitId) return { error: "Hàng này chưa có biến thể." };
    rows = [{ unitId, instanceId: null, quantity: child.quantity }];
  }

  const newDetail = await describe(rows[0].unitId, rows[0].instanceId);
  const newLabel = labelOf(newType.name, newDetail);
  const swapNote = `Đổi món combo: ${oldLabel} → ${newLabel} (${employee.name}, ${formatVNDate(vnNow())})`;
  const note = child.note ? `${child.note}\n${swapNote}` : swapNote;

  const shares = splitTotalByWeights(
    child.line_total,
    rows.map(() => 1),
  );
  const { error: updateError } = await supabase
    .from("order_equipment")
    .update({
      equipment_type_id: newType.id,
      equipment_unit_id: rows[0].unitId,
      equipment_instance_id: rows[0].instanceId,
      quantity: rows[0].quantity,
      unit_price: round2(shares[0] / rows[0].quantity),
      line_total: shares[0],
      note,
    })
    .eq("id", child.id);
  if (updateError) return { error: "Không đổi được món: " + updateError.message };

  if (rows.length > 1) {
    const { error: insertError } = await supabase.from("order_equipment").insert(
      rows.slice(1).map((r, i) => ({
        order_id: child.order_id,
        parent_line_id: child.parent_line_id,
        equipment_type_id: newType.id,
        equipment_unit_id: r.unitId,
        equipment_instance_id: r.instanceId,
        quantity: r.quantity,
        unit_price: shares[i + 1],
        line_total: shares[i + 1],
        note: swapNote,
      })),
    );
    if (insertError) return { error: "Đã đổi 1 máy nhưng thêm máy còn lại lỗi: " + insertError.message };
  }

  revalidatePath(`/orders/${child.order_id}`);
  return { success: true };
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

// ---------------------------------------------------------------------------
// Tạo đơn nhanh 1 màn hình (CEO 2026-10-03, phương án A + B + C) — mô phỏng
// cho thấy tạo 1 đơn ở CRM tốn ~41 click/14 lần chờ tải (Booqable ~23): popup
// cũ chỉ tạo "vỏ" đơn, sang trang đơn mới nhập thời gian, thêm hàng từng máy
// serial, rồi tick 3 khâu đầu từng khâu. Giờ: khách + kho + gói thời gian +
// hàng (số lượng) + phí giao/thu hồi → 1 nút tạo xong, khâu đầu tự hoàn thành.
// ---------------------------------------------------------------------------

export interface QuickOrderCatalogItem {
  key: string;
  typeId: string;
  unitId: string | null;
  label: string;
  imageUrl: string | null;
  productType: "rental" | "sale" | "service";
  trackingType: string | null;
  pricingMethod: string | null;
  rentalPeriodUnit: string | null;
  // Giá riêng biến thể nếu có, không thì giá chung của sản phẩm.
  price: number;
  templateId: string | null;
  // Hàng serial: số máy đang rảnh theo từng kho (đã trừ máy nằm trên đơn
  // chưa đóng). Hàng khác: không theo dõi ở đây.
  freeByBranch: Record<string, number> | null;
}

export interface QuickOrderCatalog {
  items: QuickOrderCatalogItem[];
  tiersByTemplate: Record<string, PricingTierInput[]>;
  employees: { id: string; name: string; branch_id: string | null }[];
  currentEmployeeId: string;
  defaultBranchId: string | null;
}

// Nạp lúc MỞ popup (không nạp sẵn ở trang danh sách đơn để trang đó nhẹ).
export async function getQuickOrderCatalog(): Promise<QuickOrderCatalog> {
  const employee = await requireRole([...ALL_ROLES]);
  const supabase = await createClient();

  const [
    { data: types },
    { data: units },
    { data: tierRows },
    { data: employees },
    instances,
    busyRows,
  ] = await Promise.all([
    supabase
      .from("equipment_types")
      .select("id, name, product_type, tracking_type, pricing_method, price, rental_period_unit, pricing_template_id, image_url")
      .order("name"),
    supabase.from("equipment_units").select("id, equipment_type_id, brand_model, price"),
    supabase.from("pricing_template_tiers").select("template_id, min_duration, duration_unit, discount_percentage"),
    supabase.from("employees_public").select("id, name, branch_id, is_active").eq("is_active", true).order("name"),
    fetchAllRowsFast<{ id: string; equipment_type_id: string; branch_id: string | null }>(
      (from, to) =>
        supabase
          .from("equipment_instances")
          .select("id, equipment_type_id, branch_id")
          .eq("status", "available")
          .order("id")
          .range(from, to),
      () => supabase.from("equipment_instances").select("id", { count: "exact", head: true }).eq("status", "available"),
    ),
    fetchAllRows<{ equipment_instance_id: string | null }>((from, to) =>
      supabase
        .from("order_equipment")
        .select("equipment_instance_id, orders!inner(completed_at, cancelled_at)")
        .not("equipment_instance_id", "is", null)
        .is("orders.completed_at", null)
        .is("orders.cancelled_at", null)
        .range(from, to),
    ),
  ]);

  const busy = new Set(busyRows.map((r) => r.equipment_instance_id));
  const freeByType = new Map<string, Record<string, number>>();
  for (const i of instances) {
    if (busy.has(i.id) || !i.branch_id) continue;
    const m = freeByType.get(i.equipment_type_id) ?? {};
    m[i.branch_id] = (m[i.branch_id] ?? 0) + 1;
    freeByType.set(i.equipment_type_id, m);
  }

  const unitsByType = new Map<string, { id: string; brand_model: string; price: number | null }[]>();
  for (const u of units ?? []) {
    const list = unitsByType.get(u.equipment_type_id) ?? [];
    list.push(u);
    unitsByType.set(u.equipment_type_id, list);
  }

  const items: QuickOrderCatalogItem[] = [];
  for (const t of types ?? []) {
    const base = {
      typeId: t.id,
      imageUrl: t.image_url,
      productType: t.product_type,
      trackingType: t.tracking_type,
      pricingMethod: t.pricing_method,
      rentalPeriodUnit: t.rental_period_unit,
      templateId: t.pricing_method === "pricing_structure" ? t.pricing_template_id : null,
    };
    if (t.product_type === "rental" && t.tracking_type === "individual") {
      items.push({ ...base, key: `t-${t.id}`, unitId: null, label: t.name, price: t.price, freeByBranch: freeByType.get(t.id) ?? {} });
      continue;
    }
    const typeUnits = unitsByType.get(t.id) ?? [];
    if (t.tracking_type !== "combo" && t.product_type !== "service" && typeUnits.length > 1) {
      for (const u of typeUnits) {
        items.push({ ...base, key: `u-${u.id}`, unitId: u.id, label: `${t.name} — ${u.brand_model}`, price: u.price ?? t.price, freeByBranch: null });
      }
      continue;
    }
    items.push({ ...base, key: `t-${t.id}`, unitId: null, label: t.name, price: typeUnits[0]?.price ?? t.price, freeByBranch: null });
  }

  const tiersByTemplate: Record<string, PricingTierInput[]> = {};
  for (const r of tierRows ?? []) {
    (tiersByTemplate[r.template_id] ??= []).push({
      min_duration: r.min_duration,
      duration_unit: r.duration_unit,
      discount_percentage: r.discount_percentage,
    });
  }

  return {
    items,
    tiersByTemplate,
    employees: (employees ?? []).map((e) => ({ id: e.id, name: e.name, branch_id: e.branch_id })),
    currentEmployeeId: employee.id,
    defaultBranchId: employee.branch_id,
  };
}

const QuickOrderSchema = z.object({
  customer_id: z.string().uuid({ message: "Vui lòng chọn khách hàng." }),
  pickup_branch_id: z.string().uuid({ message: "Vui lòng chọn kho giao." }),
  return_branch_id: z.string().uuid().nullable().optional(),
  rental_start_at: z.string().min(1, { message: "Vui lòng chọn thời gian bắt đầu thuê." }),
  rental_end_at: z.string().min(1, { message: "Vui lòng chọn thời gian kết thúc thuê." }),
  order_code: z.string().trim().min(1, { message: "Mã đơn không được để trống." }),
  order_date: z.string().min(1),
  orderer_name: z.string().trim().nullable().optional(),
  orderer_phone: z.string().trim().nullable().optional(),
  orderer_email: z
    .union([z.literal(""), z.string().trim().email({ message: "Email người đặt không hợp lệ." })])
    .nullable()
    .optional(),
  employee_id: z.string().uuid({ message: "Vui lòng chọn người phụ trách." }),
  // "quote" = Tiếp nhận + Báo giá; "deal" = thêm Chốt đơn.
  stage: z.enum(["quote", "deal"]),
  items: z
    .array(
      z.object({
        typeId: z.string().uuid(),
        unitId: z.string().uuid().nullable(),
        quantity: z.number().int().min(1),
      }),
    )
    .max(200),
});

export type QuickOrderInput = z.input<typeof QuickOrderSchema>;

export async function quickCreateOrder(
  input: QuickOrderInput,
): Promise<{ error: string } | { orderId: string; warnings: string[] }> {
  const employee = await requireRole([...ALL_ROLES]);
  const parsed = QuickOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  const d = parsed.data;
  if (new Date(d.rental_end_at) <= new Date(d.rental_start_at)) {
    return { error: "Thời gian kết thúc phải sau thời gian bắt đầu." };
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      order_code: d.order_code,
      pickup_branch_id: d.pickup_branch_id,
      return_branch_id: d.return_branch_id || d.pickup_branch_id,
      customer_id: d.customer_id,
      orderer_name: d.orderer_name || null,
      orderer_phone: d.orderer_phone || null,
      orderer_email: d.orderer_email || null,
      order_date: d.order_date,
      rental_start_at: d.rental_start_at,
      rental_end_at: d.rental_end_at,
      created_by: employee.id,
    })
    .select("id")
    .single();
  if (error || !order) {
    return { error: "Không thể tạo đơn hàng: " + (error?.message ?? "") };
  }

  // Thêm tuần tự (trigger tính lại tổng đơn theo từng dòng).
  const warnings: string[] = [];
  for (const item of d.items) {
    const lineError = await insertEquipmentLine(supabase, order.id, {
      typeId: item.typeId,
      unitId: item.unitId,
      instanceId: null,
      quantity: item.quantity,
    });
    if (lineError) warnings.push(lineError);
  }

  const taskError = await completeEarlyTasks(supabase, order.id, d.employee_id, d.stage === "deal" ? "chot_don" : "bao_gia");
  if (taskError) warnings.push(taskError);

  revalidatePath("/orders");
  return { orderId: order.id, warnings };
}

// Hoàn thành các khâu đầu (Tiếp nhận yêu cầu → … → upTo) còn dở, ghi cho 1
// người phụ trách — khâu đã xong giữ nguyên người cũ.
async function completeEarlyTasks(
  supabase: SupabaseServerClient,
  orderId: string,
  employeeId: string,
  upTo: "bao_gia" | "chot_don",
): Promise<string | null> {
  const stages = TASK_TYPE_SEQUENCE.slice(0, TASK_TYPE_SEQUENCE.indexOf(upTo) + 1);
  const { data: done } = await supabase
    .from("order_tasks")
    .select("task_type")
    .eq("order_id", orderId)
    .not("completed_date", "is", null);
  const doneSet = new Set((done ?? []).map((t) => t.task_type));
  for (const stage of stages) {
    if (doneSet.has(stage)) continue;
    const { error } = await supabase.from("order_tasks").upsert(
      {
        order_id: orderId,
        task_type: stage,
        employee_id: employeeId,
        completed_date: vnTodayString(),
      },
      { onConflict: "order_id,task_type" },
    );
    if (error) return `Không ghi được khâu "${TASK_TYPE_LABELS[stage]}": ${error.message}`;
  }
  return null;
}

// Nút "Chốt đơn" trên trang đơn (phương án C): hoàn thành Tiếp nhận + Báo giá
// + Chốt đơn còn dở trong 1 click.
export async function closeOrderDeal(orderId: string, employeeId: string): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);
  if (!z.string().uuid().safeParse(employeeId).success) {
    return { error: "Vui lòng chọn người phụ trách." };
  }
  const supabase = await createClient();
  const error = await completeEarlyTasks(supabase, orderId, employeeId, "chot_don");
  revalidatePath(`/orders/${orderId}`);
  return error ? { error } : { success: true };
}

// Đổi máy serial của 1 dòng (phương án B: hệ thống tự chọn máy, nhân viên
// đổi được) — chỉ khi đơn CHƯA giao (sau khi giao, máy đã sang "đang cho
// thuê", đổi lúc đó phải hoàn tác giao trước).
export async function getSwapInstanceOptions(
  lineId: string,
): Promise<{ id: string; label: string }[]> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("order_equipment")
    .select("order_id, equipment_type_id, equipment_instance_id")
    .eq("id", lineId)
    .single();
  if (!line?.equipment_type_id || !line.equipment_instance_id) return [];
  const { data: order } = await supabase
    .from("orders")
    .select("pickup_branch_id")
    .eq("id", line.order_id)
    .single();
  if (!order) return [];
  const ids = await pickAvailableInstances(supabase, line.equipment_type_id, order.pickup_branch_id, 500, new Set());
  if (!ids.length) return [];
  const { data: rows } = await supabase
    .from("equipment_instances")
    .select("id, identifier_code, equipment_units(brand_model)")
    .in("id", ids);
  return (rows ?? [])
    .map((r) => {
      const variant = (r.equipment_units as unknown as { brand_model: string } | null)?.brand_model;
      return { id: r.id, label: variant ? `${r.identifier_code} · ${variant}` : r.identifier_code };
    })
    .sort((a, b) => Number(a.label.startsWith("AUTO")) - Number(b.label.startsWith("AUTO")) || a.label.localeCompare(b.label));
}

export async function swapOrderLineInstance(lineId: string, instanceId: string): Promise<ActionState> {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("order_equipment")
    .select("order_id, equipment_type_id, equipment_instance_id")
    .eq("id", lineId)
    .single();
  if (!line?.equipment_type_id || !line.equipment_instance_id) {
    return { error: "Dòng này không phải máy serial." };
  }
  const { data: order } = await supabase
    .from("orders")
    .select("pickup_branch_id, delivery_stock_moved_at, completed_at, cancelled_at")
    .eq("id", line.order_id)
    .single();
  if (!order) return { error: "Không tìm thấy đơn." };
  if (order.delivery_stock_moved_at || order.completed_at || order.cancelled_at) {
    return { error: "Đơn đã giao/đã đóng — không đổi máy ở đây được." };
  }
  const free = await pickAvailableInstances(supabase, line.equipment_type_id, order.pickup_branch_id, 500, new Set());
  if (!free.includes(instanceId)) {
    return { error: "Máy này không còn trống — chọn máy khác." };
  }

  // Giữ nguyên giá dòng (có thể đã sửa tay) — chỉ đổi máy.
  const update = { equipment_instance_id: instanceId };
  const { error } = await supabase.from("order_equipment").update(update).eq("id", lineId);
  revalidatePath(`/orders/${line.order_id}`);
  return error ? { error: "Không đổi được máy: " + error.message } : { success: true };
}
