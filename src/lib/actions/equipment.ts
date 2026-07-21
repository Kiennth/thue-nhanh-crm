"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import type { Database } from "@/types/database";

type EquipmentTypeInsert = Database["public"]["Tables"]["equipment_types"]["Insert"];

const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

// ---------------------------------------------------------------------------
// equipment_types — phân loại rental/sale/service, rental thì thêm tracking
// (individual/quantity) + cách tính giá (flat_fee/pricing_structure).
// ---------------------------------------------------------------------------

const EquipmentTypeSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Tên không được để trống." }),
    product_type: z.enum(["rental", "sale", "service"]),
    tracking_type: z.enum(["individual", "quantity"]).optional(),
    pricing_method: z.enum(["flat_fee", "pricing_structure"]).optional(),
    price: z.coerce.number().min(0, { message: "Giá không được âm." }),
    rental_period_unit: z.enum(["hour", "day", "week", "month", "year"]).optional(),
    pricing_template_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.product_type !== "rental") return;

    if (!data.tracking_type) {
      ctx.addIssue({
        code: "custom",
        message: "Vui lòng chọn kiểu theo dõi tồn kho.",
        path: ["tracking_type"],
      });
    }
    if (!data.pricing_method) {
      ctx.addIssue({
        code: "custom",
        message: "Vui lòng chọn cách tính giá.",
        path: ["pricing_method"],
      });
    }
    if (!data.rental_period_unit) {
      ctx.addIssue({
        code: "custom",
        message: "Vui lòng chọn đơn vị thời gian.",
        path: ["rental_period_unit"],
      });
    }
    if (data.pricing_method === "pricing_structure" && !data.pricing_template_id) {
      ctx.addIssue({
        code: "custom",
        message: "Vui lòng chọn bảng giá mẫu.",
        path: ["pricing_template_id"],
      });
    }
  });

function normalizeEquipmentType(
  data: z.infer<typeof EquipmentTypeSchema>,
): EquipmentTypeInsert {
  if (data.product_type !== "rental") {
    return {
      name: data.name,
      product_type: data.product_type,
      price: data.price,
      tracking_type: null,
      pricing_method: null,
      rental_period_unit: null,
      pricing_template_id: null,
    };
  }

  return {
    name: data.name,
    product_type: data.product_type,
    price: data.price,
    tracking_type: data.tracking_type ?? null,
    pricing_method: data.pricing_method ?? null,
    rental_period_unit: data.rental_period_unit ?? null,
    pricing_template_id:
      data.pricing_method === "pricing_structure" ? (data.pricing_template_id ?? null) : null,
  };
}

function parseEquipmentTypeForm(formData: FormData) {
  return EquipmentTypeSchema.safeParse({
    name: formData.get("name"),
    product_type: formData.get("product_type"),
    tracking_type: formData.get("tracking_type") || undefined,
    pricing_method: formData.get("pricing_method") || undefined,
    price: formData.get("price"),
    rental_period_unit: formData.get("rental_period_unit") || undefined,
    pricing_template_id: formData.get("pricing_template_id") || undefined,
  });
}

export async function createEquipmentType(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = parseEquipmentTypeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_types")
    .insert(normalizeEquipmentType(parsed.data));

  if (error) {
    return { error: "Không thể tạo loại hàng hoá: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function updateEquipmentType(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = parseEquipmentTypeForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_types")
    .update(normalizeEquipmentType(parsed.data))
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật loại hàng hoá: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentType(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_types").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá loại hàng hoá: " + error.message);
  }

  revalidatePath("/equipment");
}

// ---------------------------------------------------------------------------
// equipment_units — biến thể theo hãng/model. Dùng cho hàng bán và hàng cho
// thuê theo dõi số lượng (không dùng cho hàng theo dõi riêng lẻ hay dịch vụ).
// ---------------------------------------------------------------------------

const EquipmentUnitSchema = z.object({
  equipment_type_id: z.string().uuid(),
  brand_model: z.string().trim().min(1, { message: "Hãng/model không được để trống." }),
  condition_notes: z.string().trim().optional(),
});

export async function createEquipmentUnit(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = EquipmentUnitSchema.safeParse({
    equipment_type_id: formData.get("equipment_type_id"),
    brand_model: formData.get("brand_model"),
    condition_notes: formData.get("condition_notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_units").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo biến thể: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function updateEquipmentUnit(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = EquipmentUnitSchema.safeParse({
    equipment_type_id: formData.get("equipment_type_id"),
    brand_model: formData.get("brand_model"),
    condition_notes: formData.get("condition_notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_units")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật biến thể: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentUnit(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_units").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá biến thể: " + error.message);
  }

  revalidatePath("/equipment");
}

// ---------------------------------------------------------------------------
// equipment_stock — tồn kho theo chi nhánh (biến thể theo dõi số lượng).
// ---------------------------------------------------------------------------

const EquipmentStockSchema = z
  .object({
    equipment_unit_id: z.string().uuid(),
    branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh." }),
    quantity_total: z.coerce.number().int().min(0, { message: "Số lượng không được âm." }),
    quantity_available: z.coerce
      .number()
      .int()
      .min(0, { message: "Số lượng sẵn có không được âm." }),
  })
  .refine((data) => data.quantity_available <= data.quantity_total, {
    message: "Số lượng sẵn có không được lớn hơn tổng số lượng.",
    path: ["quantity_available"],
  });

export async function upsertEquipmentStock(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = EquipmentStockSchema.safeParse({
    equipment_unit_id: formData.get("equipment_unit_id"),
    branch_id: formData.get("branch_id"),
    quantity_total: formData.get("quantity_total"),
    quantity_available: formData.get("quantity_available"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_stock")
    .upsert(parsed.data, { onConflict: "equipment_unit_id,branch_id" });

  if (error) {
    return { error: "Không thể cập nhật tồn kho: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentStock(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_stock").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá tồn kho: " + error.message);
  }

  revalidatePath("/equipment");
}

const TransferStockSchema = z
  .object({
    equipment_unit_id: z.string().uuid(),
    from_branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh nguồn." }),
    to_branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh đích." }),
    quantity: z.coerce.number().int().min(1, { message: "Số lượng chuyển phải lớn hơn 0." }),
    note: z.string().trim().optional(),
  })
  .refine((data) => data.from_branch_id !== data.to_branch_id, {
    message: "Chi nhánh nguồn và đích phải khác nhau.",
    path: ["to_branch_id"],
  });

export async function transferEquipmentStock(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = TransferStockSchema.safeParse({
    equipment_unit_id: formData.get("equipment_unit_id"),
    from_branch_id: formData.get("from_branch_id"),
    to_branch_id: formData.get("to_branch_id"),
    quantity: formData.get("quantity"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_equipment_stock", {
    p_equipment_unit_id: parsed.data.equipment_unit_id,
    p_from_branch_id: parsed.data.from_branch_id,
    p_to_branch_id: parsed.data.to_branch_id,
    p_quantity: parsed.data.quantity,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    return { error: "Không thể chuyển kho: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

// ---------------------------------------------------------------------------
// equipment_instances — từng sản phẩm riêng lẻ (hàng cho thuê, theo dõi
// individual). VD: xe theo biển số.
// ---------------------------------------------------------------------------

const EquipmentInstanceSchema = z.object({
  equipment_type_id: z.string().uuid(),
  identifier_code: z.string().trim().min(1, { message: "Mã định danh không được để trống." }),
  branch_id: z.string().uuid().optional(),
  status: z.enum(["available", "rented", "maintenance"]),
  condition_notes: z.string().trim().optional(),
});

function parseEquipmentInstanceForm(formData: FormData) {
  return EquipmentInstanceSchema.safeParse({
    equipment_type_id: formData.get("equipment_type_id"),
    identifier_code: formData.get("identifier_code"),
    branch_id: formData.get("branch_id") || undefined,
    status: formData.get("status"),
    condition_notes: formData.get("condition_notes") || undefined,
  });
}

export async function createEquipmentInstance(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = parseEquipmentInstanceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_instances").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo sản phẩm: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function updateEquipmentInstance(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = parseEquipmentInstanceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_instances")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật sản phẩm: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentInstance(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_instances").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá sản phẩm: " + error.message);
  }

  revalidatePath("/equipment");
}

// ---------------------------------------------------------------------------
// pricing_templates + pricing_template_tiers — bảng giá mẫu dùng chung nhiều
// sản phẩm, bậc thang % chiết khấu theo thời lượng thuê.
// ---------------------------------------------------------------------------

const PricingTemplateSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên bảng giá không được để trống." }),
});

export async function createPricingTemplate(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = PricingTemplateSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_templates").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo bảng giá mẫu: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deletePricingTemplate(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_templates").delete().eq("id", id);

  if (error) {
    throw new Error(
      "Không thể xoá bảng giá mẫu (có thể đang được sản phẩm khác dùng): " + error.message,
    );
  }

  revalidatePath("/equipment");
}

const PricingTierSchema = z.object({
  template_id: z.string().uuid(),
  min_duration: z.coerce.number().int().min(1, { message: "Thời lượng phải lớn hơn 0." }),
  duration_unit: z.enum(["hour", "day", "week", "month", "year"]),
  discount_percentage: z.coerce
    .number()
    .min(0.01, { message: "% chiết khấu phải lớn hơn 0." })
    .max(100, { message: "% chiết khấu không được vượt quá 100." }),
});

export async function createPricingTier(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = PricingTierSchema.safeParse({
    template_id: formData.get("template_id"),
    min_duration: formData.get("min_duration"),
    duration_unit: formData.get("duration_unit"),
    discount_percentage: formData.get("discount_percentage"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_template_tiers").insert(parsed.data);

  if (error) {
    return { error: "Không thể thêm bậc giá: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deletePricingTier(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("pricing_template_tiers").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá bậc giá: " + error.message);
  }

  revalidatePath("/equipment");
}
