"use client";

import { useRef, useState, useTransition } from "react";
import { Gift } from "lucide-react";
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
import { addReward } from "@/lib/actions/rewards";
import { REWARD_CATEGORY_LABELS, REWARD_CATEGORY_OPTIONS } from "@/lib/reward-labels";
import type { RewardCategory } from "@/types/database";

interface EmployeeOption {
  id: string;
  name: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Trao thưởng (module Thưởng, CEO 2026-08-09) — Giám đốc thưởng cho 1 nhân
// viên hoặc cả công ty ("all" = mỗi người 1 dòng riêng, cùng tiền + lý do),
// phân LOẠI (bất chợt/doanh số/định kỳ/Tết/sinh nhật/khác) để sổ lọc được.
// Lý do BẮT BUỘC — đây là sổ ghi chép thu nhập đột biến. Thưởng theo khoán
// KHÔNG trao ở đây (tự động theo Bậc thưởng trong Chính sách khoán).
export function RewardDialog({ employees }: { employees: EmployeeOption[] }) {
  const trigger = (
    <Button size="sm">
      <Gift className="size-4" />
      Trao thưởng
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState<string>("");
  const [category, setCategory] = useState<RewardCategory>("bat_chot");
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
        setCategory("bat_chot");
        setOpen(false);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trao thưởng</DialogTitle>
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
            <Label htmlFor="reward_category">Loại thưởng</Label>
            <Select
              name="category"
              value={category}
              onValueChange={(value) => setCategory((value as RewardCategory) ?? "bat_chot")}
            >
              <SelectTrigger id="reward_category" className="w-full">
                <SelectValue>
                  {(value: string) => REWARD_CATEGORY_LABELS[value as RewardCategory]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REWARD_CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}
