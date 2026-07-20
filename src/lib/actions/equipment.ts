"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

const EquipmentTypeSchema = z.object({
  name: z.string().trim().min(1, { message: "Tên loại thiết bị không được để trống." }),
  branch_id: z.string().uuid({ message: "Vui lòng chọn chi nhánh." }),
  rental_price_per_day: z.coerce
    .number()
    .min(0, { message: "Giá thuê không được âm." }),
});

export async function createEquipmentType(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = EquipmentTypeSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    rental_price_per_day: formData.get("rental_price_per_day"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_types").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo loại thiết bị: " + error.message };
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

  const parsed = EquipmentTypeSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    rental_price_per_day: formData.get("rental_price_per_day"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_types")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Không thể cập nhật loại thiết bị: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentType(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_types").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá loại thiết bị: " + error.message);
  }

  revalidatePath("/equipment");
}

const EquipmentUnitSchema = z
  .object({
    equipment_type_id: z.string().uuid(),
    brand_model: z.string().trim().min(1, { message: "Hãng/model không được để trống." }),
    quantity_total: z.coerce.number().int().min(0, { message: "Số lượng không được âm." }),
    quantity_available: z.coerce
      .number()
      .int()
      .min(0, { message: "Số lượng sẵn có không được âm." }),
    condition_notes: z.string().trim().optional(),
  })
  .refine((data) => data.quantity_available <= data.quantity_total, {
    message: "Số lượng sẵn có không được lớn hơn tổng số lượng.",
    path: ["quantity_available"],
  });

export async function createEquipmentUnit(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = EquipmentUnitSchema.safeParse({
    equipment_type_id: formData.get("equipment_type_id"),
    brand_model: formData.get("brand_model"),
    quantity_total: formData.get("quantity_total"),
    quantity_available: formData.get("quantity_available"),
    condition_notes: formData.get("condition_notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_units").insert(parsed.data);

  if (error) {
    return { error: "Không thể tạo biến thể thiết bị: " + error.message };
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
    quantity_total: formData.get("quantity_total"),
    quantity_available: formData.get("quantity_available"),
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
    return { error: "Không thể cập nhật biến thể thiết bị: " + error.message };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteEquipmentUnit(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_units").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá biến thể thiết bị: " + error.message);
  }

  revalidatePath("/equipment");
}
