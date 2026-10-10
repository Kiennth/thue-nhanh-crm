import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentEmployee } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { TaskType } from "@/types/database";
import { MyTasksBoard, type BoardTask, type DoneTask } from "./my-tasks-board";

// Việc của tôi (Grok tách gọn CRM 10/10, giai đoạn 4): việc sinh từ khâu đang
// chờ của đơn — hạn tính theo giờ giao/trả, đổi giờ là hạn đổi theo. 1 lần
// gọi RPC my_tasks (~231 đơn mở), lọc tab/kho ở trình duyệt.
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; branch?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: branches }] = await Promise.all([
    (supabase as unknown as SupabaseClient).rpc("my_tasks"),
    supabase.from("branches").select("id, name").order("position"),
  ]);
  const payload = (data ?? { tasks: [], doneToday: [], now: new Date(0).toISOString() }) as {
    now: string;
    tasks: (Omit<BoardTask, "task_type"> & { task_type: TaskType })[];
    doneToday: DoneTask[];
  };
  const tab = ["mine", "unclaimed", "branch", "done"].includes(params.tab ?? "") ? params.tab! : "mine";
  const branchList = branches ?? [];
  const branchId =
    params.branch === "all"
      ? null
      : branchList.some((b) => b.id === params.branch)
        ? params.branch!
        : (employee.branch_id ?? null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Việc của tôi</h1>
        <p className="text-sm text-muted-foreground">
          Việc tự sinh từ khâu đang chờ của đơn đã chốt — hạn tính theo giờ giao / trả.
        </p>
      </div>
      <MyTasksBoard
        key={`${tab}-${branchId ?? "all"}`}
        tasks={payload.tasks}
        doneToday={payload.doneToday}
        now={payload.now}
        me={{ id: employee.id, name: employee.name }}
        branches={branchList}
        initialTab={tab as "mine" | "unclaimed" | "branch" | "done"}
        initialBranch={branchId}
      />
    </div>
  );
}
