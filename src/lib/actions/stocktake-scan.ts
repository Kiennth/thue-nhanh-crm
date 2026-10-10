"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { fold } from "@/lib/stocktake-csv";

// Quét kiểm kho (CEO 2026-10-07): chọn kho → tải danh sách máy serial "phải
// có" → quét serial (máy quét mã vạch / đầu đọc RFID gõ như bàn phím, camera
// điện thoại) → trang tự đối chiếu: có mặt / thiếu / lạ. Máy lạ: ở kho khác
// (chuyển về kho này được), đang cho thuê, hoặc chưa có trong CRM (thêm nhanh).

export type ScanMachine = {
  id: string;
  code: string;
  rfid: string[];
  typeId: string;
  typeName: string;
  unitName: string | null;
  status: "available" | "rented" | "maintenance" | "disposed";
  branchId: string | null;
  branchName: string | null;
};

type InstanceRow = {
  id: string;
  identifier_code: string;
  equipment_type_id: string;
  equipment_unit_id: string | null;
  status: ScanMachine["status"];
  branch_id: string | null;
};

async function decorate(supabase: Awaited<ReturnType<typeof createClient>>, rows: InstanceRow[]): Promise<ScanMachine[]> {
  if (!rows.length) return [];
  const typeIds = [...new Set(rows.map((r) => r.equipment_type_id))];
  const unitIds = [...new Set(rows.map((r) => r.equipment_unit_id).filter((x): x is string => !!x))];
  const ids = rows.map((r) => r.id);
  const [{ data: types }, { data: branches }] = await Promise.all([
    supabase.from("equipment_types").select("id, name").in("id", typeIds),
    supabase.from("branches").select("id, name"),
  ]);
  const units: { id: string; brand_model: string }[] = [];
  for (let i = 0; i < unitIds.length; i += 100) {
    const { data } = await supabase.from("equipment_units").select("id, brand_model").in("id", unitIds.slice(i, i + 100));
    units.push(...(data ?? []));
  }
  const tags: { tag_code: string; equipment_instance_id: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("rfid_tags")
      .select("tag_code, equipment_instance_id")
      .in("equipment_instance_id", ids.slice(i, i + 100));
    tags.push(...(data ?? []));
  }
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const unitName = new Map(units.map((u) => [u.id, u.brand_model]));
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const tagsBy = new Map<string, string[]>();
  for (const t of tags) {
    if (!t.equipment_instance_id) continue;
    tagsBy.set(t.equipment_instance_id, [...(tagsBy.get(t.equipment_instance_id) ?? []), t.tag_code]);
  }
  return rows.map((r) => ({
    id: r.id,
    code: r.identifier_code,
    rfid: tagsBy.get(r.id) ?? [],
    typeId: r.equipment_type_id,
    typeName: typeName.get(r.equipment_type_id) ?? "",
    unitName: r.equipment_unit_id ? (unitName.get(r.equipment_unit_id) ?? null) : null,
    status: r.status,
    branchId: r.branch_id,
    branchName: r.branch_id ? (branchName.get(r.branch_id) ?? null) : null,
  }));
}

// Danh sách máy "phải có" ở kho đã chọn (đang ở kho: sẵn sàng / bảo trì).
// Máy đang cho thuê không tính là phải có (đang ở chỗ khách).
export async function loadScanScope(
  branchId: string,
  categoryId: string | null,
  search: string | null,
): Promise<{ machines: ScanMachine[]; rentedCount: number } | { error: string }> {
  const employee = await requireRole([...EQUIPMENT_WRITE_ROLES]);
  if (employee.role === "cua_hang_truong" && branchId !== employee.branch_id) {
    return { error: "Bạn chỉ kiểm được kho của mình." };
  }
  const supabase = await createClient();
  let typeQuery = supabase.from("equipment_types").select("id, name").eq("product_type", "rental").eq("tracking_type", "individual");
  if (categoryId) typeQuery = typeQuery.eq("category_id", categoryId);
  const { data: types } = await typeQuery;
  const q = search ? fold(search) : "";
  const typeIds = new Set((types ?? []).filter((t) => !q || fold(t.name).includes(q)).map((t) => t.id));
  const rows = await fetchAllRows<InstanceRow>((from, to) =>
    supabase
      .from("equipment_instances")
      .select("id, identifier_code, equipment_type_id, equipment_unit_id, status, branch_id")
      .eq("branch_id", branchId)
      .neq("status", "disposed")
      .order("identifier_code")
      .range(from, to),
  );
  const inScope = rows.filter((r) => typeIds.has(r.equipment_type_id));
  const atStore = inScope.filter((r) => r.status !== "rented");
  return { machines: await decorate(supabase, atStore), rentedCount: inScope.length - atStore.length };
}

// Tra các mã quét được mà không nằm trong danh sách "phải có": tìm theo serial
// (không phân biệt hoa thường) hoặc mã thẻ RFID ở toàn bộ CRM.
export async function lookupScannedCodes(codes: string[]): Promise<Record<string, ScanMachine | null>> {
  await requireRole([...EQUIPMENT_WRITE_ROLES]);
  const supabase = await createClient();
  const out: Record<string, ScanMachine | null> = {};
  const uniq = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].slice(0, 200);
  for (const code of uniq) {
    const { data: byCode } = await supabase
      .from("equipment_instances")
      .select("id, identifier_code, equipment_type_id, equipment_unit_id, status, branch_id")
      .ilike("identifier_code", code.replace(/[%_]/g, "\\$&"))
      .limit(1);
    let row = (byCode ?? [])[0] as InstanceRow | undefined;
    if (!row) {
      const { data: tag } = await supabase
        .from("rfid_tags")
        .select("equipment_instance_id")
        .eq("tag_code", code)
        .not("equipment_instance_id", "is", null)
        .limit(1);
      const instId = tag?.[0]?.equipment_instance_id;
      if (instId) {
        const { data } = await supabase
          .from("equipment_instances")
          .select("id, identifier_code, equipment_type_id, equipment_unit_id, status, branch_id")
          .eq("id", instId)
          .limit(1);
        row = (data ?? [])[0] as InstanceRow | undefined;
      }
    }
    out[code] = row ? (await decorate(supabase, [row]))[0] : null;
  }
  return out;
}

// Máy quét được ở kho này nhưng CRM ghi kho khác → ghi lại kho cho đúng thực
// tế. Chỉ quản lý (như chuyển kho), bỏ qua máy đang thuê / đã thanh lý.
export async function moveScannedToBranch(instanceIds: string[], branchId: string): Promise<{ error: string } | { moved: number }> {
  await requireRole([...MANAGE_ROLES]);
  if (!instanceIds.length) return { moved: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_instances")
    .update({ branch_id: branchId })
    .in("id", instanceIds)
    .in("status", ["available", "maintenance"])
    .select("id");
  if (error) return { error: "Không ghi được kho: " + error.message };
  revalidatePath("/equipment");
  return { moved: data?.length ?? 0 };
}

// Máy quét được nhưng chưa có trong CRM → thêm nhanh vào kho đang kiểm.
export async function addScannedMachine(input: {
  code: string;
  typeId: string;
  unitId: string | null;
  branchId: string;
}): Promise<{ error: string } | { machine: ScanMachine }> {
  const employee = await requireRole([...EQUIPMENT_WRITE_ROLES]);
  if (employee.role === "cua_hang_truong" && input.branchId !== employee.branch_id) {
    return { error: "Bạn chỉ thêm máy vào kho của mình." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_instances")
    .insert({
      equipment_type_id: input.typeId,
      equipment_unit_id: input.unitId,
      identifier_code: input.code.trim(),
      branch_id: input.branchId,
      status: "available",
      condition_notes: "Thêm khi quét kiểm kho",
    })
    .select("id, identifier_code, equipment_type_id, equipment_unit_id, status, branch_id")
    .single();
  if (error) {
    if (error.message.includes("identifier_code_key")) return { error: "Serial này đã có trong CRM." };
    return { error: "Không thêm được máy: " + error.message };
  }
  revalidatePath("/equipment");
  return { machine: (await decorate(supabase, [data as InstanceRow]))[0] };
}

// Danh sách mã hàng theo serial (cho ô chọn khi thêm máy lạ).
export async function listSerialTypes(): Promise<{ id: string; name: string; units: { id: string; name: string }[] }[]> {
  await requireRole([...EQUIPMENT_WRITE_ROLES]);
  const supabase = await createClient();
  const [{ data: types }, units] = await Promise.all([
    supabase.from("equipment_types").select("id, name").eq("product_type", "rental").eq("tracking_type", "individual").order("name"),
    fetchAllRows<{ id: string; equipment_type_id: string; brand_model: string }>((from, to) =>
      supabase.from("equipment_units").select("id, equipment_type_id, brand_model").order("id").range(from, to),
    ),
  ]);
  return (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    units: units.filter((u) => u.equipment_type_id === t.id).map((u) => ({ id: u.id, name: u.brand_model })),
  }));
}
