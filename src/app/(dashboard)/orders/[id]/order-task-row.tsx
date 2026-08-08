"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { upsertOrderTask, uncompleteOrderTask } from "@/lib/actions/orders";
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
  // Chỉ true cho ĐÚNG khâu "done" cuối cùng (page.tsx tự tính) — bỏ tick khâu
  // giữa chừng trong khi khâu sau vẫn "done" sẽ phá tính tuần tự bắt buộc.
  canUncomplete?: boolean;
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
  // "Giao hàng & bàn giao"/"Nhập kho & bảo trì" đụng tồn kho thật — cảnh báo
  // rõ hơn 2 khâu còn lại (chỉ xoá completed_date).
  const touchesStock = taskType === "giao_hang_ban_giao" || taskType === "nhap_kho_bao_tri";

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
          Đơn sẽ lùi về đang chờ ở khâu này, phần khoán của khâu này sẽ mất khỏi bảng lương.
          {touchesStock &&
            " Khâu này đã trừ/trả tồn kho thật — bỏ hoàn thành sẽ tự hoàn tác đúng phần tồn kho đó."}
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

  if (status === "done") {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
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

  const rowKey = `${task?.employee_id ?? ""}-${task?.note ?? ""}`;

  return (
    <form
      key={rowKey}
      action={handleSubmit}
      className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.03] p-3 shadow-sm"
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
