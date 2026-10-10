"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reassignOrderTask, uncompleteOrderTask } from "@/lib/actions/orders";
import { StepCompleterInline, type StepChecks } from "./step-completer";
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
  // done: đã hoàn thành, chỉ hiện tóm tắt. current: khâu đang tới lượt — do
  // gating tuần tự nên chỉ có đúng 1 khâu ở trạng thái này cùng lúc, hiện
  // form đầy đủ. locked: chưa tới lượt, hiện mờ, không có form/nút bấm.
  status: "done" | "current" | "locked";
  // Chỉ true cho ĐÚNG khâu "done" cuối cùng (page.tsx tự tính) — bỏ tick khâu
  // giữa chừng trong khi khâu sau vẫn "done" sẽ phá tính tuần tự bắt buộc.
  canUncomplete?: boolean;
  // Giám đốc/Admin/Kế toán: đổi người hoàn thành khâu đã xong ngay tại chỗ,
  // không phải Bỏ hoàn thành (CEO 2026-10-05).
  canReassign?: boolean;
  // Khâu đang tới lượt: người đang đăng nhập (mặc định người làm), số liệu
  // cảnh báo nợ/cọc và gợi ý thu tiền (giai đoạn 3 tách gọn CRM).
  completer: {
    currentEmployeeId: string | null;
    checks: StepChecks;
    paymentDefault: { type: "invoice" | "deposit_collect"; amount: number } | null;
  };
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
  priorityCount = 0,
  priorityLabel,
  task,
  status,
  canUncomplete,
  canReassign,
  completer,
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
    <StepCompleterInline
      orderId={orderId}
      label={label}
      step={{ taskType, employees, priorityCount, priorityLabel, assignedId: task?.employee_id ?? null }}
      currentEmployeeId={completer.currentEmployeeId}
      checks={completer.checks}
      paymentDefault={completer.paymentDefault}
    />
  );
}
