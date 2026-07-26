"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertOrderTask } from "@/lib/actions/orders";
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
}

export function OrderTaskRow({ orderId, taskType, label, employees, task, status }: OrderTaskRowProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertOrderTask(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-sm font-medium">{label}</span>
        {task?.completed_date && (
          <span className="text-xs text-muted-foreground">({task.completed_date})</span>
        )}
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="py-0.5">
        <span className="text-sm text-muted-foreground/60">{label}</span>
      </div>
    );
  }

  const rowKey = `${task?.employee_id ?? ""}-${task?.note ?? ""}`;

  return (
    <form
      key={rowKey}
      action={handleSubmit}
      className="space-y-2 rounded-md border bg-muted/30 p-2.5"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="task_type" value={taskType} />
      <input type="hidden" name="completed" value="on" />

      <p className="text-sm font-medium">{label}</p>

      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select name="employee_id" defaultValue={task?.employee_id ?? undefined}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Người phụ trách">
              {(value: string) => employees.find((e) => e.id === value)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input name="note" placeholder="Ghi chú" defaultValue={task?.note ?? ""} />

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "..." : "Hoàn thành"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
