import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEmployeeMonthlyPerformance } from "@/lib/employee-performance-charts";

// Bộ nhớ đệm báo cáo trong bảng report_cache (Grok tách gọn CRM 10/10): tính
// nặng 1 lần, lần sau đọc lại. Chỉ server (service role) đọc/ghi.
async function cachedJson<T>(key: string, maxAgeMs: number, compute: () => Promise<T>): Promise<T> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await admin.from("report_cache").select("data, computed_at").eq("key", key).maybeSingle();
  if (data && Date.now() - Date.parse(data.computed_at) < maxAgeMs) return data.data as T;
  const value = await compute();
  await admin.from("report_cache").upsert({ key, data: value, computed_at: new Date().toISOString() });
  return value;
}

const MIN = 60_000;

// Quỹ lương theo kho của 1 tháng ("YYYY-MM") cho khối Lợi nhuận gộp. Tính
// bảng lương toàn công ty rất nặng → tháng đã qua giữ 1 giờ, tháng hiện tại
// 15 phút (số liệu có thể trễ tối đa chừng đó).
export async function payrollByBranchForMonth(month: string, currentMonth: string): Promise<Record<string, number>> {
  return cachedJson(`payroll_by_branch:${month}`, month < currentMonth ? 60 * MIN : 15 * MIN, async () => {
    const rows = await computeEmployeeMonthlyPerformance(month);
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (!r.branchId) continue;
      out[r.branchId] = (out[r.branchId] ?? 0) + r.totalIncome;
    }
    return out;
  });
}
