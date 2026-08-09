"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
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
import { addRewardRule } from "@/lib/actions/rewards";
import type { RewardRuleType } from "@/types/database";

interface EmployeeOption {
  id: string;
  name: string;
}

const RULE_TYPE_LABELS: Record<RewardRuleType, string> = {
  doanh_so: "Thưởng doanh số (đạt mốc thì gợi ý trao)",
  dinh_ky: "Thưởng định kỳ (áp 1 chạm mỗi tháng)",
};

// Tạo qui tắc thưởng (giai đoạn 2) — doanh_so cần mốc doanh số tháng
// (doanh số CHỈ tính đơn hoàn tất, chưa VAT — khớp số trang Đơn hàng);
// dinh_ky chỉ cần tên + tiền + người nhận.
export function RuleDialog({ employees }: { employees: EmployeeOption[] }) {
  const trigger = (
    <Button variant="outline" size="sm">
      <Plus className="size-4" />
      Thêm qui tắc
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ruleType, setRuleType] = useState<RewardRuleType>("doanh_so");
  const [recipient, setRecipient] = useState<string>("all");
  const formRef = useRef<HTMLFormElement>(null);

  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addRewardRule(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        toast.success("Đã tạo qui tắc thưởng.");
        formRef.current?.reset();
        setRuleType("doanh_so");
        setRecipient("all");
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
          <DialogTitle>Thêm qui tắc thưởng</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule_type">Loại qui tắc</Label>
            <Select
              name="rule_type"
              value={ruleType}
              onValueChange={(value) => setRuleType((value as RewardRuleType) ?? "doanh_so")}
            >
              <SelectTrigger id="rule_type" className="w-full">
                <SelectValue>
                  {(value: string) => RULE_TYPE_LABELS[value as RewardRuleType]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doanh_so">{RULE_TYPE_LABELS.doanh_so}</SelectItem>
                <SelectItem value="dinh_ky">{RULE_TYPE_LABELS.dinh_ky}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule_label">Tên qui tắc</Label>
            <Input
              id="rule_label"
              name="label"
              placeholder={
                ruleType === "doanh_so"
                  ? "Vd: Thưởng doanh số 1 tỷ"
                  : "Vd: Phụ cấp chuyên cần"
              }
              required
            />
          </div>

          {ruleType === "doanh_so" && (
            <div className="space-y-2">
              <Label htmlFor="rule_threshold">Mốc doanh số tháng (đ)</Label>
              <Input
                id="rule_threshold"
                name="threshold_amount"
                type="number"
                min={1}
                step={1}
                placeholder="Vd: 1000000000"
                required
              />
              <p className="text-xs text-muted-foreground">
                Doanh số chỉ tính đơn hoàn tất, chưa VAT — khớp &quot;Tổng doanh số&quot; trang Đơn
                hàng.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule_amount">Tiền thưởng (đ/người)</Label>
            <Input id="rule_amount" name="amount" type="number" min={1} step={1} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule_employee_id">Người nhận</Label>
            <Select
              name="employee_id"
              value={recipient}
              onValueChange={(value) => setRecipient(value ?? "all")}
            >
              <SelectTrigger id="rule_employee_id" className="w-full">
                <SelectValue>
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
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Tạo qui tắc"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
