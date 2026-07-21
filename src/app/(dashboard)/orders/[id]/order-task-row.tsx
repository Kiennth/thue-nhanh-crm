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
  canComplete: boolean;
}

export function OrderTaskRow({
  orderId,
  taskType,
  label,
  employees,
  task,
  canComplete,
}: OrderTaskRowProps) {
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

  const isDone = !!task?.completed_date;
  // Remount với dữ liệu mới sau mỗi lần lưu thành công — tránh lệch trạng
  // thái giữa input uncontrolled và dữ liệu thật (React tự reset form sau
  // khi action chạy xong, làm checkbox mất đồng bộ nếu không remount).
  const rowKey = `${task?.employee_id ?? ""}-${task?.completed_date ?? ""}-${task?.has_issue ?? false}-${task?.note ?? ""}`;

  return (
    <form
      key={rowKey}
      action={handleSubmit}
      className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] items-center gap-2 border-b py-2 last:border-b-0"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="task_type" value={taskType} />

      <div className="flex items-center gap-2">
        <span className={isDone ? "font-medium" : ""}>{label}</span>
        {isDone && (
          <span className="text-xs text-muted-foreground">({task?.completed_date})</span>
        )}
      </div>

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

      <label className="flex items-center gap-1 text-sm whitespace-nowrap">
        <input
          type="checkbox"
          name="has_issue"
          defaultChecked={!!task?.has_issue}
          className="size-4 rounded border-input"
        />
        Sự cố
      </label>

      <label className="flex items-center gap-1 text-sm whitespace-nowrap">
        <input
          type="checkbox"
          name="completed"
          defaultChecked={isDone}
          disabled={!canComplete && !isDone}
          className="size-4 rounded border-input"
        />
        Hoàn thành
      </label>

      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "..." : "Lưu"}
      </Button>

      {error && <p className="col-span-6 text-sm text-destructive">{error}</p>}
    </form>
  );
}
