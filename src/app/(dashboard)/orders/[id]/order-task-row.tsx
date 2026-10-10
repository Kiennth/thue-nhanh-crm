"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Hand, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { completeMyStep, reassignOrderTask, uncompleteOrderTask } from "@/lib/actions/orders";
import type { TaskType } from "@/types/database";

interface EmployeeOption {
  id: string;
  name: string;
}

interface OrderTaskRowProps {
  orderId: string;
  taskType: TaskType;
  label: string;
  employees: EmployeeOption[];
  // `employees` đã xếp sẵn: priorityCount người đầu là nhân sự của kho phụ
  // trách khâu này (hiện thành nhóm riêng có nhãn priorityLabel).
  priorityCount?: number;
  priorityLabel?: string;
  task?: {
    employee_id: string | null;
    note: string | null;
    has_issue: boolean;
    completed_date: string | null;
  };
  // done: đã có người làm (hiện tên + ngày). current: chưa ai làm — nút "Tôi
  // làm" (ai bấm thì ghi cho người đó, CEO 2026-10-11). "locked" giữ cho
  // tương thích, không còn dùng (bỏ khoá tuần tự).
  status: "done" | "current" | "locked";
  // Bỏ tick khâu (Giám đốc/Admin/Kế toán/Cửa hàng trưởng — hậu kiểm).
  canUncomplete?: boolean;
  // Giám đốc/Admin/Kế toán: đổi người hoàn thành khâu đã xong ngay tại chỗ
  // (hậu kiểm, CEO 2026-10-05 / 2026-10-11).
  canReassign?: boolean;
}

function UncompleteTaskButton({
  orderId,
  taskType,
  label,
}: {
  orderId: string;
  taskType: TaskType;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await uncompleteOrderTask(orderId, taskType);
        toast.success(`Đã bỏ hoàn thành khâu "${label}".`);
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Undo2 className="size-3.5" />
            Bỏ hoàn thành
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bỏ hoàn thành khâu &quot;{label}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Phần khoán của khâu này sẽ mất khỏi bảng lương. Kho và trạng thái đơn giữ nguyên (muốn lùi
          đơn thì dùng nút Hoàn tác trên thanh luồng đơn).
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Không bỏ
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? "Đang xử lý..." : "Bỏ hoàn thành"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderTaskRow({
  orderId,
  taskType,
  label,
  employees,
  task,
  status,
  canUncomplete,
  canReassign,
}: OrderTaskRowProps) {
  const [pending, startTransition] = useTransition();

  if (status === "done") {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {canReassign && (
            <select
              aria-label="Người hoàn thành"
              title="Đổi người hoàn thành (khoán tính theo người này)"
              disabled={pending}
              value={task?.employee_id ?? ""}
              onChange={(e) => {
                const employeeId = e.target.value;
                if (!employeeId) return;
                startTransition(async () => {
                  const result = await reassignOrderTask(orderId, taskType, employeeId);
                  if (result && "error" in result) toast.error(result.error);
                  else toast.success(`Đã đổi người hoàn thành khâu "${label}".`);
                });
              }}
              className="h-7 max-w-40 rounded-md border bg-transparent px-1.5 text-xs"
            >
              {!task?.employee_id && <option value="">— Chưa ghi người —</option>}
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          {!canReassign && (
            <span className="text-xs font-medium">
              {employees.find((e) => e.id === task?.employee_id)?.name ?? "—"}
            </span>
          )}
          {task?.completed_date && (
            <span className="text-xs text-muted-foreground">{task.completed_date}</span>
          )}
          {canUncomplete && <UncompleteTaskButton orderId={orderId} taskType={taskType} label={label} />}
        </div>
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="py-0.5">
        <span className="text-sm text-muted-foreground/50">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-sm">{label}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await completeMyStep(orderId, taskType);
            if (result && "error" in result) toast.error(result.error);
            else toast.success(`Đã ghi khâu "${label}" cho bạn.`);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />}
        Tôi làm
      </Button>
    </div>
  );
}
