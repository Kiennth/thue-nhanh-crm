"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { computeOrderLinePrice, type PricingTierInput } from "@/lib/rental-pricing";
import { TASK_TYPE_LABELS, TASK_TYPE_SEQUENCE } from "@/lib/order-labels";

const ALL_ROLES = ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"] as const;
const DELETE_ROLES = ["admin", "ke_toan"] as const;
const MANAGE_ROLES = ["admin", "ke_toan"] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ActionState = { error: string } | { success: true } | undefined;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

const OrderSchema = z.object({
  order_code: z.string().trim().min(1, { message: "Mã đơn không được để trống." }),
  branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh." }),
  customer_id: z.string().uuid({ message: "Vui lòng chọn khách hàng." }),
  order_date: z.string().min(1, { message: "Vui lòng chọn ngày." }),
});

function parseOrderForm(formData: FormData) {
  return OrderSchema.safeParse({
    order_code: formData.get("order_code"),
    branch_id: formData.get("branch_id"),
    customer_id: formData.get("customer_id"),
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

  const typeIds = [...new Set(lineList.map((l) => l.equipment_type_id))];
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

  const eligible = lineList.filter((l) => productTypeById.get(l.equipment_type_id) === "rental");
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
    .select("id, equipment_type_id, quantity")
    .eq("order_id", id);

  for (const line of lines ?? []) {
    const { equipmentType, computed } = await computeLineForEquipmentType(
      supabase,
      line.equipment_type_id,
      parsed.data.rental_start_at,
      parsed.data.rental_end_at,
      line.quantity,
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

export async function deleteOrder(id: string) {
  await requireRole([...DELETE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá đơn hàng: " + error.message);
  }

  revalidatePath("/orders");
}

export async function closeOrder(id: string) {
  await requireRole([...ALL_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error("Không thể đóng đơn: " + error.message);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

// ---------------------------------------------------------------------------
// order_equipment — dòng thiết bị/sản phẩm trong đơn. Server Action tự tra
// equipment_types (+ bảng giá mẫu nếu có) để tính unit_price/line_total —
// client chỉ gửi lựa chọn sản phẩm + số lượng + ngày thuê (nếu có).
// ---------------------------------------------------------------------------

async function computeLineForEquipmentType(
  supabase: SupabaseServerClient,
  equipmentTypeId: string,
  rentalStartAt: string | null,
  rentalEndAt: string | null,
  quantity: number,
) {
  const { data: equipmentType, error: typeError } = await supabase
    .from("equipment_types")
    .select("product_type, tracking_type, pricing_method, price, rental_period_unit, pricing_template_id")
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

  const computed = computeOrderLinePrice({
    productType: equipmentType.product_type,
    price: equipmentType.price,
    rentalPeriodUnit: equipmentType.rental_period_unit,
    pricingMethod: equipmentType.pricing_method,
    tiers,
    rentalStartAt,
    rentalEndAt,
    quantity,
  });

  return { equipmentType, computed };
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

  let computed;
  try {
    ({ computed } = await computeLineForEquipmentType(
      supabase,
      parsed.data.equipment_type_id,
      order?.rental_start_at ?? null,
      order?.rental_end_at ?? null,
      parsed.data.quantity,
    ));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tính được giá dòng hàng." };
  }

  const { error } = await supabase.from("order_equipment").insert({
    order_id: parsed.data.order_id,
    equipment_type_id: parsed.data.equipment_type_id,
    equipment_unit_id: parsed.data.equipment_unit_id ?? null,
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
      completed_date: parsed.data.completed ? new Date().toISOString().slice(0, 10) : null,
    },
    { onConflict: "order_id,task_type" },
  );

  if (error) {
    return { error: "Không thể cập nhật khâu: " + error.message };
  }

  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { success: true };
}
