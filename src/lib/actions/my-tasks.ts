"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ALL_ROLES } from "@/lib/roles";
import { getOrderStepChecks, type OrderStepChecks } from "@/lib/order-step-checks";
import type { TaskType } from "@/types/database";

// Việc của tôi + chuông thông báo (Grok tách gọn CRM 10/10, giai đoạn 4).
// Việc tính từ khâu đang chờ của đơn (RPC open_step_tasks), không có bảng
// tasks riêng — xem migration 20261010190000.

export type TaskAlert = {
  key: string;
  orderId: string;
  orderCode: string;
  taskType: TaskType;
  dueAt: string;
  kind: "soon" | "overdue";
  mine: boolean;
  customerName: string | null;
  seen: boolean;
};

const STEP_TASKS: TaskType[] = [
  "ky_hop_dong_thu_coc",
  "chuan_bi",
  "giao_hang_ban_giao",
  "thu_hoi",
  "nghiem_thu",
  "nhap_kho_bao_tri",
];

// Bảng/hàm mới chưa có trong types/database.ts.
async function db() {
  return (await createClient()) as unknown as SupabaseClient;
}

export async function getTaskAlerts(): Promise<{ myDue: number; alerts: TaskAlert[] }> {
  await requireRole([...ALL_ROLES]);
  const { data, error } = await (await db()).rpc("my_task_alerts");
  if (error || !data) return { myDue: 0, alerts: [] };
  return data as { myDue: number; alerts: TaskAlert[] };
}

export async function markTaskAlertsSeen(keys: string[]): Promise<void> {
  const employee = await requireRole([...ALL_ROLES]);
  const clean = [...new Set(keys)].filter((k) => typeof k === "string" && k.length < 200).slice(0, 200);
  if (!clean.length) return;
  await (await db())
    .from("task_alert_seen")
    .upsert(
      clean.map((alert_key) => ({ employee_id: employee.id, alert_key })),
      { onConflict: "employee_id,alert_key", ignoreDuplicates: true },
    );
}

// Nhận việc "Chưa ai nhận": ghi tên mình vào khâu (chưa hoàn thành). Không
// cướp việc đã có người nhận.
export async function claimOrderStep(orderId: string, taskType: TaskType): Promise<{ error: string } | { success: true }> {
  const employee = await requireRole([...ALL_ROLES]);
  if (!STEP_TASKS.includes(taskType)) return { error: "Khâu không hợp lệ." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("order_tasks")
    .select("id, employee_id, completed_date")
    .eq("order_id", orderId)
    .eq("task_type", taskType)
    .maybeSingle();
  if (existing?.completed_date) return { error: "Khâu này đã hoàn thành." };
  if (existing?.employee_id && existing.employee_id !== employee.id) return { error: "Việc này đã có người nhận." };
  const { error } = existing
    ? await supabase.from("order_tasks").update({ employee_id: employee.id }).eq("id", existing.id).is("employee_id", null)
    : await supabase.from("order_tasks").insert({ order_id: orderId, task_type: taskType, employee_id: employee.id });
  if (error) return { error: error.message };
  revalidatePath("/my-tasks");
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

// Số liệu cảnh báo nợ/cọc cho hộp "Hoàn thành" mở từ Việc của tôi.
export async function getStepChecksForOrder(orderId: string): Promise<OrderStepChecks> {
  await requireRole([...ALL_ROLES]);
  return getOrderStepChecks(await createClient(), orderId);
}
