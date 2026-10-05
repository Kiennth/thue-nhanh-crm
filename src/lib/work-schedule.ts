import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_LINE_CATEGORY_BY_TYPE_ID, TRANSPORT_LINE_CATEGORY_BY_TYPE_ID } from "@/lib/commission";
import type { JobKind, ShiftKind } from "@/lib/shift-presets";

// Lịch làm việc nhân viên (CEO 2026-10-05): ca trực (bảng work_shifts) +
// việc được giao (dòng đơn dịch vụ/vận chuyển có gắn employee_id).

// 2 SKU ô tô không nằm trong TRANSPORT_LINE_CATEGORY_BY_TYPE_ID (không khoán).
const CAR_TRANSPORT: Record<string, "delivery" | "collection"> = {
  "ce4a5f88-8daa-47c2-92fc-196d1fc321db": "delivery",
  "1a53924a-a070-44b0-9441-3f09042af7e7": "collection",
};

const JOB_KIND_BY_TYPE: Record<string, JobKind> = {
  ...TRANSPORT_LINE_CATEGORY_BY_TYPE_ID,
  ...CAR_TRANSPORT,
  ...SERVICE_LINE_CATEGORY_BY_TYPE_ID,
};

// Việc làm lúc NHẬN hàng hay lúc TRẢ hàng.
const AT_END: Set<JobKind> = new Set(["collection", "removal"]);

export interface ShiftRow {
  id: string;
  employee_id: string;
  branch_id: string | null;
  shift_date: string;
  kind: ShiftKind;
  label: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export interface JobItem {
  employeeId: string;
  kind: JobKind;
  at: string; // ISO
  orderId: string;
  orderCode: string;
  customer: string;
  address: string | null;
}

type JobLine = {
  employee_id: string;
  equipment_type_id: string;
  note: string | null;
  extra_information: string | null;
  orders: {
    id: string;
    order_code: string;
    rental_start_at: string | null;
    rental_end_at: string | null;
    cancelled_at: string | null;
    customers: { name: string } | null;
  } | null;
};

// Việc được giao trong [fromIso, toIso). employeeId null = mọi người.
export async function loadJobs(
  db: SupabaseClient,
  fromIso: string,
  toIso: string,
  employeeId: string | null = null,
): Promise<JobItem[]> {
  const typeIds = Object.keys(JOB_KIND_BY_TYPE);
  const run = async (column: "rental_start_at" | "rental_end_at") => {
    let q = db
      .from("order_equipment")
      .select(
        "employee_id, equipment_type_id, note, extra_information, orders!inner(id, order_code, rental_start_at, rental_end_at, cancelled_at, customers(name))",
      )
      .not("employee_id", "is", null)
      .in("equipment_type_id", typeIds)
      .is("orders.cancelled_at", null)
      .gte(`orders.${column}`, fromIso)
      .lt(`orders.${column}`, toIso)
      .limit(2000);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data } = await q;
    return (data ?? []) as unknown as JobLine[];
  };
  const [byStart, byEnd] = await Promise.all([run("rental_start_at"), run("rental_end_at")]);
  const jobs: JobItem[] = [];
  const push = (l: JobLine, wantEnd: boolean) => {
    const kind = JOB_KIND_BY_TYPE[l.equipment_type_id];
    if (!kind || !l.orders || AT_END.has(kind) !== wantEnd) return;
    const at = wantEnd ? l.orders.rental_end_at : l.orders.rental_start_at;
    if (!at) return;
    jobs.push({
      employeeId: l.employee_id,
      kind,
      at,
      orderId: l.orders.id,
      orderCode: l.orders.order_code,
      customer: l.orders.customers?.name ?? "—",
      address:
        kind === "delivery" || kind === "collection"
          ? l.extra_information?.trim() || (l.note?.trim().startsWith("Gắn lại") ? null : l.note?.trim() || null)
          : null,
    });
  };
  for (const l of byStart) push(l, false);
  for (const l of byEnd) push(l, true);
  return jobs.sort((a, b) => a.at.localeCompare(b.at));
}

export async function loadShifts(
  db: SupabaseClient,
  fromDate: string,
  toDate: string, // không gồm
  employeeId: string | null = null,
): Promise<ShiftRow[]> {
  let q = db
    .from("work_shifts")
    .select("id, employee_id, branch_id, shift_date, kind, label, start_time, end_time, note")
    .gte("shift_date", fromDate)
    .lt("shift_date", toDate)
    .order("start_time", { nullsFirst: false })
    .limit(5000);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  return (data ?? []) as ShiftRow[];
}
