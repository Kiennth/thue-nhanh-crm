"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

// Xếp ca (CEO 2026-10-05). Quyền thật do RLS work_shifts: Giám đốc/Admin/Kế
// toán mọi kho, Cửa hàng trưởng chỉ nhân viên kho mình.
const SCHEDULER_ROLES = ["giam_doc", "admin", "ke_toan", "cua_hang_truong"] as const;

type Result = { error: string } | { success: true };

const ShiftSchema = z.object({
  employee_id: z.string().uuid(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["work", "leave", "off"]),
  label: z.string().trim().min(1).max(60),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export async function saveShift(
  shiftId: string | null,
  input: z.input<typeof ShiftSchema>,
): Promise<Result> {
  const me = await requireRole([...SCHEDULER_ROLES]);
  const parsed = ShiftSchema.safeParse(input);
  if (!parsed.success) return { error: "Thông tin ca không hợp lệ." };
  const d = parsed.data;
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: emp } = await db.from("employees").select("branch_id").eq("id", d.employee_id).maybeSingle();
  const row = {
    ...d,
    start_time: d.kind === "work" ? d.start_time : null,
    end_time: d.kind === "work" ? d.end_time : null,
    note: d.note || null,
    branch_id: emp?.branch_id ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = shiftId
    ? await db.from("work_shifts").update(row).eq("id", shiftId)
    : await db.from("work_shifts").insert({ ...row, created_by: me.id });
  if (error) return { error: error.code === "42501" ? "Bạn không được xếp ca cho người này." : error.message };
  revalidatePath("/schedule");
  return { success: true };
}

export async function deleteShift(shiftId: string): Promise<Result> {
  await requireRole([...SCHEDULER_ROLES]);
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.from("work_shifts").delete().eq("id", shiftId);
  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return { success: true };
}

// Chép toàn bộ ca tuần trước sang tuần đang xem (chỉ ngày còn trống của
// từng người — không ghi đè ca đã xếp).
export async function copyPreviousWeek(weekStart: string, employeeIds: string[]): Promise<Result & { copied?: number }> {
  const me = await requireRole([...SCHEDULER_ROLES]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { error: "Tuần không hợp lệ." };
  const day = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const prevStart = day(weekStart, -7);
  const db = (await createClient()) as unknown as SupabaseClient;
  const ids = employeeIds.filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200);
  if (!ids.length) return { error: "Không có nhân viên nào." };
  const [{ data: prev }, { data: cur }] = await Promise.all([
    db.from("work_shifts").select("*").in("employee_id", ids).gte("shift_date", prevStart).lt("shift_date", weekStart),
    db.from("work_shifts").select("employee_id, shift_date").in("employee_id", ids).gte("shift_date", weekStart).lt("shift_date", day(weekStart, 7)),
  ]);
  const taken = new Set((cur ?? []).map((s: { employee_id: string; shift_date: string }) => `${s.employee_id}|${s.shift_date}`));
  const rows = (prev ?? [])
    .map((s: Record<string, string | null>) => ({
      employee_id: s.employee_id,
      branch_id: s.branch_id,
      shift_date: day(s.shift_date as string, 7),
      kind: s.kind,
      label: s.label,
      start_time: s.start_time,
      end_time: s.end_time,
      note: s.note,
      created_by: me.id,
    }))
    .filter((r) => !taken.has(`${r.employee_id}|${r.shift_date}`));
  if (!rows.length) return { success: true, copied: 0 };
  const { error } = await db.from("work_shifts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return { success: true, copied: rows.length };
}
