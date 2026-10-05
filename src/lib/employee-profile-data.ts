import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeMyPerformance, type MyPerformance } from "@/lib/my-performance";
import { vnTodayString } from "@/lib/vn-time";
import type { UserRole, TaskType } from "@/types/database";

// Dữ liệu trang hồ sơ nhân viên (CEO 2026-10-05: "mỗi người 1 trang profile
// xịn xò"). Đọc bằng admin client — CHỈ gọi sau khi đã kiểm quyền (chính chủ
// hoặc Giám đốc) ở trang.

export interface ProfileInfo {
  company_phone: string | null;
  personal_phone: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  facebook_url: string | null;
  citizen_id: string | null;
  citizen_id_issued_on: string | null;
  citizen_id_issued_place: string | null;
  address: string | null;
  notes: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface ProfileData {
  employee: {
    id: string;
    name: string;
    email: string | null;
    role: UserRole;
    branch_id: string | null;
    base_salary: number;
    birthday: string | null;
    is_active: boolean;
    created_at: string;
  };
  branchName: string | null;
  profile: ProfileInfo | null;
  perf: MyPerformance;
  lifetimeTasks: number;
  lifetimeOrders: number;
  recentTasks: { taskType: TaskType; date: string; orderId: string; orderCode: string }[];
  rewards: { date: string; amount: number; reason: string }[];
}

export async function loadProfileData(employeeId: string): Promise<ProfileData | null> {
  const admin = createAdminClient();
  const db = admin as unknown as SupabaseClient;
  const { data: employee } = await admin
    .from("employees")
    .select("id, name, email, role, branch_id, base_salary, birthday, is_active, created_at")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) return null;

  const [branchRes, profileRes, perf, tasksCount, orderRows, recentRes, rewardsRes] = await Promise.all([
    employee.branch_id
      ? admin.from("branches").select("name").eq("id", employee.branch_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("employee_profiles").select("*").eq("employee_id", employeeId).maybeSingle(),
    computeMyPerformance(employee.id, employee.branch_id, employee.base_salary),
    admin
      .from("order_tasks")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .not("completed_date", "is", null),
    admin.from("order_tasks").select("order_id").eq("employee_id", employeeId).not("completed_date", "is", null).limit(5000),
    admin
      .from("order_tasks")
      .select("task_type, completed_date, order_id, orders(order_code)")
      .eq("employee_id", employeeId)
      .not("completed_date", "is", null)
      // Bỏ ngày ở tương lai (dữ liệu nhập cũ có khâu ghi năm 2027).
      .lte("completed_date", vnTodayString())
      .order("completed_date", { ascending: false })
      .limit(8),
    admin
      .from("reward_entries")
      .select("entry_date, amount, reason")
      .eq("employee_id", employeeId)
      .order("entry_date", { ascending: false })
      .limit(6),
  ]);

  return {
    employee,
    branchName: (branchRes.data as { name: string } | null)?.name ?? null,
    profile: (profileRes.data as ProfileInfo | null) ?? null,
    perf,
    lifetimeTasks: tasksCount.count ?? 0,
    lifetimeOrders: new Set((orderRows.data ?? []).map((r) => r.order_id)).size,
    recentTasks: ((recentRes.data ?? []) as unknown as {
      task_type: TaskType;
      completed_date: string;
      order_id: string;
      orders: { order_code: string } | null;
    }[]).map((t) => ({
      taskType: t.task_type,
      date: t.completed_date,
      orderId: t.order_id,
      orderCode: t.orders?.order_code ?? "—",
    })),
    rewards: (rewardsRes.data ?? []).map((r) => ({ date: r.entry_date, amount: r.amount, reason: r.reason })),
  };
}
