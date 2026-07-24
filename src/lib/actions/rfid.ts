"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import type { RfidScanType } from "@/types/database";

const ALL_ROLES = ["admin", "ke_toan", "ky_thuat_sales", "quan_ly_chi_nhanh"] as const;
const MANAGE_ROLES = ["admin", "ke_toan"] as const;

export type ActionState = { error: string } | { success: true } | undefined;

// ---------------------------------------------------------------------------
// rfid_tags — gán 1 tag RFID cho 1 biến thể (equipment_unit, hàng theo dõi số
// lượng) hoặc 1 sản phẩm cụ thể (equipment_instance, hàng theo dõi riêng lẻ).
// Chỉ Admin + Kế toán, giống mọi thao tác quản lý thiết bị khác.
// ---------------------------------------------------------------------------

const RfidTagSchema = z.object({
  tag_code: z.string().trim().min(1, { message: "Mã tag không được để trống." }),
  equipment_type_id: z.string().uuid(),
  equipment_unit_id: z.string().uuid().optional(),
  equipment_instance_id: z.string().uuid().optional(),
});

export async function createRfidTag(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...MANAGE_ROLES]);

  const parsed = RfidTagSchema.safeParse({
    tag_code: formData.get("tag_code"),
    equipment_type_id: formData.get("equipment_type_id"),
    equipment_unit_id: formData.get("equipment_unit_id") || undefined,
    equipment_instance_id: formData.get("equipment_instance_id") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rfid_tags").insert(parsed.data);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Mã tag này đã được dùng, hoặc sản phẩm này đã có tag rồi."
          : "Không thể gán tag: " + error.message,
    };
  }

  revalidatePath("/equipment");
  return { success: true };
}

export async function deleteRfidTag(id: string) {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { error } = await supabase.from("rfid_tags").delete().eq("id", id);

  if (error) {
    throw new Error("Không thể xoá tag: " + error.message);
  }

  revalidatePath("/equipment");
}

// ---------------------------------------------------------------------------
// Quét RFID khi giao hàng/thu hồi — đối chiếu TOÀN BỘ tag đã quét (mọi đợt,
// không chỉ đợt vừa rồi) cho đơn này với danh sách thiết bị của đơn
// (order_equipment), báo thiếu/thừa thay vì nhân viên phải đếm tay.
// ---------------------------------------------------------------------------

export interface RfidScanResult {
  error?: string;
  matchedCount: number;
  unmatchedCodes: string[];
  lines: { label: string; expected: number; scanned: number }[];
}

export async function recordRfidScanBatch(
  orderId: string,
  scanType: RfidScanType,
  branchId: string,
  tagCodes: string[],
): Promise<RfidScanResult> {
  const employee = await requireRole([...ALL_ROLES]);

  const codes = [...new Set(tagCodes.map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return { error: "Chưa quét tag nào.", matchedCount: 0, unmatchedCodes: [], lines: [] };
  }

  const supabase = await createClient();

  const { data: tags, error: tagsError } = await supabase
    .from("rfid_tags")
    .select("id, tag_code")
    .in("tag_code", codes);

  if (tagsError) {
    return {
      error: "Không đọc được tag: " + tagsError.message,
      matchedCount: 0,
      unmatchedCodes: [],
      lines: [],
    };
  }

  const foundCodes = new Set((tags ?? []).map((t) => t.tag_code));
  const unmatchedCodes = codes.filter((c) => !foundCodes.has(c));
  const matchedTags = tags ?? [];

  if (matchedTags.length > 0) {
    const { error: insertError } = await supabase.from("rfid_scan_log").insert(
      matchedTags.map((tag) => ({
        tag_id: tag.id,
        scan_type: scanType,
        order_id: orderId,
        branch_id: branchId,
        employee_id: employee.id,
      })),
    );

    if (insertError) {
      return {
        error: "Không thể ghi nhận quét: " + insertError.message,
        matchedCount: 0,
        unmatchedCodes,
        lines: [],
      };
    }
  }

  const [{ data: scanRows }, { data: orderLines }, { data: equipmentTypes }] = await Promise.all([
    supabase.from("rfid_scan_log").select("tag_id").eq("order_id", orderId).eq("scan_type", scanType),
    supabase
      .from("order_equipment")
      .select("equipment_type_id, equipment_unit_id, equipment_instance_id, quantity")
      .eq("order_id", orderId),
    supabase.from("equipment_types").select("id, name"),
  ]);

  const scannedTagIds = [...new Set((scanRows ?? []).map((r) => r.tag_id))];
  const { data: scannedTags } =
    scannedTagIds.length > 0
      ? await supabase
          .from("rfid_tags")
          .select("id, equipment_unit_id, equipment_instance_id")
          .in("id", scannedTagIds)
      : { data: [] };

  const typeNameById = new Map((equipmentTypes ?? []).map((t) => [t.id, t.name]));
  const scannedCountByKey = new Map<string, number>();
  for (const tag of scannedTags ?? []) {
    const key = tag.equipment_unit_id
      ? `unit:${tag.equipment_unit_id}`
      : `instance:${tag.equipment_instance_id}`;
    scannedCountByKey.set(key, (scannedCountByKey.get(key) ?? 0) + 1);
  }

  const lines = (orderLines ?? [])
    .filter((line) => line.equipment_unit_id || line.equipment_instance_id)
    .map((line) => {
      const key = line.equipment_unit_id
        ? `unit:${line.equipment_unit_id}`
        : `instance:${line.equipment_instance_id}`;
      return {
        label: (line.equipment_type_id && typeNameById.get(line.equipment_type_id)) ?? "—",
        expected: line.quantity,
        scanned: scannedCountByKey.get(key) ?? 0,
      };
    });

  revalidatePath(`/orders/${orderId}`);
  return { matchedCount: matchedTags.length, unmatchedCodes, lines };
}
