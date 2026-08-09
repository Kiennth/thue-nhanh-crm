"use client";

import { useRef, useState, useTransition } from "react";
import { Gift, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addReward, deleteReward } from "@/lib/actions/rewards";

interface EmployeeOption {
  id: string;
  name: string;
}

export interface RewardEntryRow {
  id: string;
  employee_id: string;
  entry_date: string;
  amount: number;
  reason: string;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Thưởng đột xuất (CEO 2026-08-09) — Giám đốc thưởng cho 1 nhân viên hoặc
// cả công ty ("all" = mỗi người 1 dòng riêng, cùng tiền + lý do). Lý do
// BẮT BUỘC: đây là sổ ghi chép thu nhập đột biến. Dialog kèm luôn sổ của
// tháng đang xem để soát/xoá nhầm lẫn (thưởng theo khoán đã có qui luật
// riêng ở Bậc thưởng — không liên quan khoản này).
export function RewardDialog({
  employees,
  entries,
  monthLabel,
}: {
  employees: EmployeeOption[];
  entries: RewardEntryRow[];
  monthLabel: string;
}) {
  const trigger = (
    <Button variant="outline" size="sm">
      <Gift className="size-4" />
      Thưởng đột xuất
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);

  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addReward(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        toast.success(
          recipient === "all" ? "Đã ghi thưởng cho cả công ty." : "Đã ghi khoản thưởng.",
        );
        formRef.current?.reset();
        setRecipient("");
      }
    });
  }

  function handleDelete(entry: RewardEntryRow) {
    startTransition(async () => {
      try {
        await deleteReward(entry.id);
        toast.success("Đã xoá khoản thưởng.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thưởng đột xuất</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reward_employee_id">Người nhận</Label>
            <Select
              name="employee_id"
              value={recipient}
              onValueChange={(value) => setRecipient(value ?? "")}
            >
              <SelectTrigger id="reward_employee_id" className="w-full">
                <SelectValue placeholder="Chọn người nhận">
                  {(value: string) =>
                    value === "all" ? "Cả công ty" : employeeNameById.get(value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cả công ty (mỗi người một khoản)</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recipient === "all" && (
              <p className="text-xs text-muted-foreground">
                Mỗi nhân viên đang hoạt động ({employees.length} người) nhận đúng số tiền bên dưới
                — tổng chi = số tiền × {employees.length}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward_entry_date">Ngày</Label>
            <Input
              id="reward_entry_date"
              name="entry_date"
              type="date"
              defaultValue={todayStr()}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward_amount">Số tiền (đ)</Label>
            <Input id="reward_amount" name="amount" type="number" min={1} step={1} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward_reason">Lý do (bắt buộc — sẽ được ghi chép lại)</Label>
            <Input
              id="reward_reason"
              name="reason"
              placeholder="Vd: Thưởng nóng dự án ABC, thưởng lễ 2/9..."
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || !recipient}>
            {pending ? "Đang lưu..." : "Ghi khoản thưởng"}
          </Button>
        </form>

        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Sổ thưởng tháng {monthLabel}</p>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có khoản thưởng nào trong tháng.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {employeeNameById.get(entry.employee_id) ?? "—"}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {entry.entry_date.split("-").reverse().join("/")}
                      </span>
                    </p>
                    <p className="text-muted-foreground truncate">{entry.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-medium">{currencyFormatter.format(entry.amount)}đ</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      onClick={() => handleDelete(entry)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Xoá</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
