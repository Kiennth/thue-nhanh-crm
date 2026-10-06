"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { EQUIPMENT_WRITE_ROLES, MANAGE_ROLES } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { EQUIPMENT_INSTANCE_STATUS_LABELS } from "@/lib/equipment-labels";
import type { EquipmentInstanceStatus } from "@/types/database";
import { fold, formatDateVN, isDeleteAction, parseDate, STOCKTAKE_HEADERS, toCsv, type StocktakeRow } from "@/lib/stocktake-csv";

// Kiểm kho bằng bảng tính (CEO 2026-10-06: "hàng trăm máy làm trên CRM chậm
// lắm"). Chỉ hàng cho thuê theo serial. Xuất CSV → sửa ở Google Sheets/Excel →
// tải lên: xem trước (preview) → áp dụng (apply chạy lại đúng phép kiểm của
// preview, có lỗi là không ghi gì). Máy không có trong file thì không đụng.
//
// Quy tắc:
//  - Dòng có "Mã nội bộ": sửa serial / biến thể / kho / ghi chú. Không đổi mã
//    hàng qua bảng. Đổi kho chỉ quản lý (như chuyển kho), máy đang cho thuê
//    không đổi kho được.
//  - Dòng trống "Mã nội bộ": máy mới (Mã hàng phải trùng tên trong CRM).
//  - Hành động "xoá": máy đang ở đơn mở → chặn; máy có lịch sử thuê → chuyển
//    "đã thanh lý" (giữ lịch sử); chưa từng thuê → xoá hẳn.
//  - Serial trùng (với máy khác trong CRM hoặc trong file) → chặn.
//  - Cửa hàng trưởng chỉ sửa máy kho mình.

type Branch = { id: string; name: string };
type TypeRow = { id: string; name: string; category_id: string | null };
type UnitRow = { id: string; equipment_type_id: string; brand_model: string };
type InstanceRow = {
  id: string;
  equipment_type_id: string;
  equipment_unit_id: string | null;
  identifier_code: string;
  branch_id: string | null;
  status: EquipmentInstanceStatus;
  condition_notes: string | null;
  warranty_expires_on: string | null;
};

export type StocktakePreview = {
  updates: { line: number; id: string; serial: string; typeName: string; changes: string[] }[];
  creates: { line: number; typeName: string; serial: string; branch: string; variant: string }[];
  deletes: { line: number; id: string; serial: string; typeName: string; mode: "delete" | "retire" }[];
  errors: { line: number; message: string }[];
  unchanged: number;
};

const BRANCH_ALIASES: Record<string, string[]> = {
  hcm: ["tp hcm", "hcm", "sg", "sai gon", "ho chi minh", "tp ho chi minh", "kho hcm", "kho tp hcm"],
  hn: ["ha noi", "hn", "kho ha noi", "kho hn"],
  dn: ["da nang", "dn", "kho da nang", "kho dn"],
};

function branchKey(name: string): string {
  const f = fold(name);
  for (const [k, list] of Object.entries(BRANCH_ALIASES)) if (list.includes(f)) return k;
  return f;
}

async function loadCatalog() {
  const supabase = await createClient();
  const [{ data: branches }, { data: types }, units] = await Promise.all([
    supabase.from("branches").select("id, name"),
    supabase
      .from("equipment_types")
      .select("id, name, category_id")
      .eq("product_type", "rental")
      .eq("tracking_type", "individual")
      .order("name"),
    fetchAllRows<UnitRow>((from, to) =>
      supabase.from("equipment_units").select("id, equipment_type_id, brand_model").order("id").range(from, to),
    ),
  ]);
  return {
    supabase,
    branches: (branches ?? []) as Branch[],
    types: (types ?? []) as TypeRow[],
    units,
  };
}

export async function exportStocktakeCsv(
  branchId: string | null,
  categoryId: string | null,
  search: string | null,
): Promise<{ csv: string; count: number } | { error: string }> {
  const employee = await requireRole([...EQUIPMENT_WRITE_ROLES]);
  const { supabase, branches, types, units } = await loadCatalog();
  const effectiveBranch = employee.role === "cua_hang_truong" ? employee.branch_id : branchId;
  const q = search ? fold(search) : "";
  const typeIdSet = new Set(
    types
      .filter((t) => (!categoryId || t.category_id === categoryId) && (!q || fold(t.name).includes(q)))
      .map((t) => t.id),
  );

  const instances = await fetchAllRows<InstanceRow>((from, to) => {
    let q = supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, equipment_unit_id, identifier_code, branch_id, status, condition_notes, warranty_expires_on")
      .neq("status", "disposed")
      .order("identifier_code")
      .range(from, to);
    if (effectiveBranch) q = q.eq("branch_id", effectiveBranch);
    return q;
  });

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const unitName = new Map(units.map((u) => [u.id, u.brand_model]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const rows = instances
    .filter((i) => typeIdSet.has(i.equipment_type_id))
    .sort(
      (a, b) =>
        (typeName.get(a.equipment_type_id) ?? "").localeCompare(typeName.get(b.equipment_type_id) ?? "", "vi") ||
        (branchName.get(a.branch_id ?? "") ?? "").localeCompare(branchName.get(b.branch_id ?? "") ?? "", "vi") ||
        a.identifier_code.localeCompare(b.identifier_code),
    )
    .map((i) => [
      i.id,
      typeName.get(i.equipment_type_id) ?? "",
      i.equipment_unit_id ? (unitName.get(i.equipment_unit_id) ?? "") : "",
      i.identifier_code,
      i.branch_id ? (branchName.get(i.branch_id) ?? "") : "",
      EQUIPMENT_INSTANCE_STATUS_LABELS[i.status] ?? i.status,
      i.condition_notes ?? "",
      formatDateVN(i.warranty_expires_on),
      "",
    ]);
  return { csv: toCsv([[...STOCKTAKE_HEADERS], ...rows]), count: rows.length };
}

async function analyse(rows: StocktakeRow[]) {
  const employee = await requireRole([...EQUIPMENT_WRITE_ROLES]);
  const isStoreManager = employee.role === "cua_hang_truong";
  const canMoveBranch = MANAGE_ROLES.includes(employee.role);
  const { supabase, branches, types, units } = await loadCatalog();

  const typeByFold = new Map(types.map((t) => [fold(t.name), t]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const branchByKey = new Map(branches.map((b) => [branchKey(b.name), b]));
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const unitsByType = new Map<string, UnitRow[]>();
  for (const u of units) unitsByType.set(u.equipment_type_id, [...(unitsByType.get(u.equipment_type_id) ?? []), u]);

  // Mọi serial trong CRM (kể cả máy đã thanh lý — ràng buộc unique toàn bảng).
  const allCodes = await fetchAllRows<{ id: string; identifier_code: string }>((from, to) =>
    supabase.from("equipment_instances").select("id, identifier_code").order("id").range(from, to),
  );
  const codeOwner = new Map(allCodes.map((c) => [fold(c.identifier_code), c.id]));

  const ids = rows.map((r) => r.id).filter(Boolean);
  const existing = new Map<string, InstanceRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("equipment_instances")
      .select("id, equipment_type_id, equipment_unit_id, identifier_code, branch_id, status, condition_notes, warranty_expires_on")
      .in("id", ids.slice(i, i + 100));
    for (const r of (data ?? []) as InstanceRow[]) existing.set(r.id, r);
  }

  const preview: StocktakePreview = { updates: [], creates: [], deletes: [], errors: [], unchanged: 0 };
  const plannedUpdates: { id: string; row: InstanceRow; patch: Partial<InstanceRow> }[] = [];
  const plannedCreates: Omit<InstanceRow, "id">[] = [];
  const deleteIds: string[] = [];
  const finalCode = new Map<string, { id: string; line: number }>(); // serial cuối → máy
  const seenIds = new Set<string>();
  const err = (line: number, message: string) => preview.errors.push({ line, message });

  const resolveUnit = (typeId: string, variant: string, line: number): string | null | undefined => {
    const list = unitsByType.get(typeId) ?? [];
    if (!variant) return null;
    const u = list.find((x) => fold(x.brand_model) === fold(variant));
    if (!u) {
      err(line, `Biến thể "${variant}" không có trong mã hàng (có: ${list.map((x) => x.brand_model).join(", ") || "không có biến thể"}).`);
      return undefined;
    }
    return u.id;
  };

  for (const r of rows) {
    if (r.id) {
      if (seenIds.has(r.id)) {
        err(r.line, "Mã nội bộ bị lặp trong file.");
        continue;
      }
      seenIds.add(r.id);
      const inst = existing.get(r.id);
      if (!inst || inst.status === "disposed") {
        err(r.line, "Không tìm thấy máy theo Mã nội bộ (đã xoá/thanh lý?) — xuất lại file mới.");
        continue;
      }
      const type = typeById.get(inst.equipment_type_id);
      if (isStoreManager && inst.branch_id !== employee.branch_id) {
        err(r.line, `Máy ${inst.identifier_code} không thuộc kho của bạn.`);
        continue;
      }
      if (isDeleteAction(r.action)) {
        deleteIds.push(inst.id);
        preview.deletes.push({ line: r.line, id: inst.id, serial: inst.identifier_code, typeName: type?.name ?? "", mode: "delete" });
        continue;
      }
      if (r.action) {
        err(r.line, `Hành động "${r.action}" không hiểu — để trống hoặc ghi "xoá".`);
        continue;
      }
      if (r.typeName && type && fold(r.typeName) !== fold(type.name)) {
        err(r.line, `Không đổi mã hàng qua bảng (máy thuộc "${type.name}"). Xoá dòng rồi thêm dòng mới nếu cần.`);
        continue;
      }
      const patch: Partial<InstanceRow> = {};
      const changes: string[] = [];
      if (!r.serial) {
        err(r.line, "Serial trống.");
        continue;
      }
      if (r.serial !== inst.identifier_code) {
        patch.identifier_code = r.serial;
        changes.push(`Serial ${inst.identifier_code} → ${r.serial}`);
      }
      const unitId = resolveUnit(inst.equipment_type_id, r.variant, r.line);
      if (unitId === undefined) continue;
      if (r.variant && unitId !== inst.equipment_unit_id) {
        patch.equipment_unit_id = unitId;
        changes.push(`Biến thể → ${r.variant}`);
      }
      if (r.branch) {
        const b = branchByKey.get(branchKey(r.branch));
        if (!b) {
          err(r.line, `Kho "${r.branch}" không có (dùng: ${branches.map((x) => x.name).join(", ")}).`);
          continue;
        }
        if (b.id !== inst.branch_id) {
          if (!canMoveBranch) {
            err(r.line, "Cửa hàng trưởng không đổi kho qua bảng — nhờ quản lý chuyển kho.");
            continue;
          }
          if (inst.status === "rented") {
            err(r.line, `Máy ${inst.identifier_code} đang cho thuê — thu hồi xong mới đổi kho.`);
            continue;
          }
          patch.branch_id = b.id;
          changes.push(`Kho ${branchById.get(inst.branch_id ?? "")?.name ?? "—"} → ${b.name}`);
        }
      }
      const note = r.note || null;
      if ((note ?? "") !== (inst.condition_notes ?? "")) {
        patch.condition_notes = note;
        changes.push(note ? `Ghi chú: ${note}` : "Xoá ghi chú");
      }
      const warranty = parseDate(r.warranty);
      if (warranty === undefined) {
        err(r.line, `Ngày bảo hành "${r.warranty}" không hiểu — ghi dạng 31/12/2027.`);
        continue;
      }
      if ((warranty ?? "") !== (inst.warranty_expires_on ?? "")) {
        patch.warranty_expires_on = warranty;
        changes.push(warranty ? `Bảo hành đến ${formatDateVN(warranty)}` : "Xoá ngày bảo hành");
      }
      finalCode.set(fold(r.serial), { id: inst.id, line: r.line });
      if (!changes.length) {
        preview.unchanged++;
        continue;
      }
      plannedUpdates.push({ id: inst.id, row: inst, patch });
      preview.updates.push({ line: r.line, id: inst.id, serial: r.serial, typeName: type?.name ?? "", changes });
      continue;
    }

    // Máy mới
    if (isDeleteAction(r.action)) {
      err(r.line, "Dòng máy mới không có Mã nội bộ nên không xoá được.");
      continue;
    }
    const type = typeByFold.get(fold(r.typeName));
    if (!type) {
      err(r.line, `Mã hàng "${r.typeName}" không có trong CRM (phải trùng đúng tên, hàng cho thuê theo serial).`);
      continue;
    }
    if (!r.serial) {
      err(r.line, "Máy mới thiếu Serial.");
      continue;
    }
    const b = branchByKey.get(branchKey(r.branch));
    if (!b) {
      err(r.line, `Máy mới thiếu Kho hoặc kho "${r.branch}" không có.`);
      continue;
    }
    if (isStoreManager && b.id !== employee.branch_id) {
      err(r.line, "Bạn chỉ thêm máy vào kho của mình.");
      continue;
    }
    const typeUnits = unitsByType.get(type.id) ?? [];
    if (typeUnits.length > 1 && !r.variant) {
      err(r.line, `Mã "${type.name}" có nhiều biến thể — điền cột Biến thể (${typeUnits.map((x) => x.brand_model).join(", ")}).`);
      continue;
    }
    const unitId = resolveUnit(type.id, r.variant, r.line);
    if (unitId === undefined) continue;
    const warranty = parseDate(r.warranty);
    if (warranty === undefined) {
      err(r.line, `Ngày bảo hành "${r.warranty}" không hiểu — ghi dạng 31/12/2027.`);
      continue;
    }
    finalCode.set(fold(r.serial), { id: `new:${r.line}`, line: r.line });
    plannedCreates.push({
      equipment_type_id: type.id,
      equipment_unit_id: unitId ?? (typeUnits.length === 1 ? typeUnits[0].id : null),
      identifier_code: r.serial,
      branch_id: b.id,
      status: "available",
      condition_notes: r.note || null,
      warranty_expires_on: warranty,
    });
    preview.creates.push({ line: r.line, typeName: type.name, serial: r.serial, branch: b.name, variant: r.variant });
  }

  // Serial trùng: trong file, hoặc với máy khác trong CRM không bị đổi tên/xoá trong file.
  const releasing = new Set<string>([
    ...deleteIds,
    ...plannedUpdates.filter((u) => u.patch.identifier_code).map((u) => u.id),
  ]);
  const seenFinal = new Map<string, number>();
  for (const r of rows) {
    if (!r.serial || isDeleteAction(r.action)) continue;
    const key = fold(r.serial);
    const target = finalCode.get(key);
    if (!target || target.line !== r.line) continue;
    if (seenFinal.has(key)) {
      err(r.line, `Serial "${r.serial}" trùng với dòng ${seenFinal.get(key)} trong file.`);
      continue;
    }
    seenFinal.set(key, r.line);
    const owner = codeOwner.get(key);
    if (owner && owner !== target.id && !releasing.has(owner)) {
      err(r.line, `Serial "${r.serial}" đã có ở máy khác trong CRM.`);
    }
  }

  // Xoá: chặn máy đang ở đơn mở; máy có lịch sử → thanh lý (giữ lịch sử).
  if (deleteIds.length) {
    const used = new Map<string, { open: boolean }>();
    for (let i = 0; i < deleteIds.length; i += 100) {
      const { data } = await supabase
        .from("order_equipment")
        .select("equipment_instance_id, orders(completed_at, cancelled_at)")
        .in("equipment_instance_id", deleteIds.slice(i, i + 100));
      for (const l of (data ?? []) as unknown as {
        equipment_instance_id: string;
        orders: { completed_at: string | null; cancelled_at: string | null } | null;
      }[]) {
        const open = !!l.orders && !l.orders.completed_at && !l.orders.cancelled_at;
        const prev = used.get(l.equipment_instance_id);
        used.set(l.equipment_instance_id, { open: (prev?.open ?? false) || open });
      }
    }
    for (const d of preview.deletes) {
      const u = used.get(d.id);
      if (u?.open) err(d.line, `Máy ${d.serial} đang nằm trong đơn chưa xong — không xoá được.`);
      else if (u) d.mode = "retire";
    }
  }

  return { preview, plannedUpdates, plannedCreates, supabase, employee };
}

export async function previewStocktake(rows: StocktakeRow[]): Promise<StocktakePreview> {
  const { preview } = await analyse(rows);
  return preview;
}

export async function applyStocktake(
  rows: StocktakeRow[],
): Promise<{ error: string } | { success: true; updated: number; created: number; deleted: number; retired: number }> {
  const { preview, plannedUpdates, plannedCreates, supabase } = await analyse(rows);
  if (preview.errors.length) return { error: `Còn ${preview.errors.length} lỗi — sửa file rồi tải lên lại.` };
  const today = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  // 1. Xoá / thanh lý trước (giải phóng serial).
  const hardDelete = preview.deletes.filter((d) => d.mode === "delete").map((d) => d.id);
  const retire = preview.deletes.filter((d) => d.mode === "retire").map((d) => d.id);
  if (hardDelete.length) {
    const { error } = await supabase.from("equipment_instances").delete().in("id", hardDelete);
    if (error) return { error: "Không xoá được máy: " + error.message };
  }
  if (retire.length) {
    const { error } = await supabase
      .from("equipment_instances")
      .update({ status: "disposed", branch_id: null, condition_notes: `Xoá khi kiểm kho ${today}` })
      .in("id", retire);
    if (error) return { error: "Không chuyển thanh lý được: " + error.message };
  }

  // 2. Sửa máy: 2 lượt upsert (serial tạm rồi serial thật) để đổi chéo serial
  //    giữa các máy không vướng ràng buộc unique.
  if (plannedUpdates.length) {
    const full = plannedUpdates.map(({ row, patch }) => ({
      id: row.id,
      equipment_type_id: row.equipment_type_id,
      status: row.status,
      equipment_unit_id: patch.equipment_unit_id !== undefined ? patch.equipment_unit_id : row.equipment_unit_id,
      branch_id: patch.branch_id !== undefined ? patch.branch_id : row.branch_id,
      condition_notes: patch.condition_notes !== undefined ? patch.condition_notes : row.condition_notes,
      warranty_expires_on: patch.warranty_expires_on !== undefined ? patch.warranty_expires_on : row.warranty_expires_on,
      identifier_code: patch.identifier_code ?? row.identifier_code,
    }));
    const renamed = full.filter((_, i) => plannedUpdates[i].patch.identifier_code);
    if (renamed.length) {
      const { error } = await supabase
        .from("equipment_instances")
        .upsert(renamed.map((r) => ({ ...r, identifier_code: `${r.identifier_code}__kk_${r.id.slice(0, 8)}` })), {
          onConflict: "id",
        });
      if (error) return { error: "Không đổi được serial: " + error.message };
    }
    const { error } = await supabase.from("equipment_instances").upsert(full, { onConflict: "id" });
    if (error) {
      if (error.message.includes("identifier_code_key")) return { error: "Trùng serial với máy khác — tải lại trang, xuất file mới." };
      return { error: "Không cập nhật được máy: " + error.message };
    }
  }

  // 3. Máy mới.
  if (plannedCreates.length) {
    const { error } = await supabase.from("equipment_instances").insert(plannedCreates);
    if (error) {
      if (error.message.includes("identifier_code_key")) return { error: "Máy mới trùng serial với máy khác trong CRM." };
      return { error: "Không thêm được máy mới: " + error.message };
    }
  }

  revalidatePath("/equipment");
  return {
    success: true,
    updated: plannedUpdates.length,
    created: plannedCreates.length,
    deleted: hardDelete.length,
    retired: retire.length,
  };
}
