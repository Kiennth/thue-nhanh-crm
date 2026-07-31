"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarSync, Pencil } from "lucide-react";
import {
  createRecurringExpense,
  updateRecurringExpense,
  type ActionState,
} from "@/lib/actions/expenses";
import { FREQUENCY_LABELS, type RecurringExpenseDef } from "@/lib/recurring-expenses";
import type { RecurringFrequency } from "@/types/database";

// Khai một lần cho các khoản lặp lại — thuê nhà, trả góp xe, lãi ngân hàng.
// Ngày bắt đầu ấn định ngày ghi mỗi kỳ; bỏ trống ngày kết thúc = chạy đến
// khi tự tay dừng.
export function RecurringExpenseDialog({
  branches,
  categories,
  lockedBranchId,
  recurring,
}: {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  lockedBranchId?: string | null;
  recurring?: RecurringExpenseDef;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!recurring;

  const [branchId, setBranchId] = useState(recurring?.branch_id ?? lockedBranchId ?? "");
  const [categoryId, setCategoryId] = useState(recurring?.category_id ?? "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    recurring?.frequency ?? "monthly",
  );

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("branch_id", lockedBranchId ?? branchId);
    formData.set("category_id", categoryId);
    formData.set("frequency", frequency);
    startTransition(async () => {
      const result: ActionState = isEdit
        ? await updateRecurringExpense(recurring.id, undefined, formData)
        : await createRecurringExpense(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="icon" aria-label="Sửa chi phí định kỳ">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button variant="outline">
              <CalendarSync className="size-4" /> Thêm định kỳ
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa chi phí định kỳ" : "Thêm chi phí định kỳ"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {!lockedBranchId && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Chi nhánh</label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn chi nhánh">
                    {(v: string) => branchNameById.get(v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Hạng mục</label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn hạng mục">
                    {(v: string) => categoryNameById.get(v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Chu kỳ</label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency((v as RecurringFrequency) ?? "monthly")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => FREQUENCY_LABELS[v as RecurringFrequency]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as RecurringFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="recurring-amount">
              Số tiền mỗi kỳ (đ)
            </label>
            <Input
              id="recurring-amount"
              name="amount"
              type="number"
              min={0}
              step={1000}
              required
              defaultValue={recurring?.amount ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="recurring-start">
                Ngày bắt đầu
              </label>
              <Input
                id="recurring-start"
                name="start_date"
                type="date"
                required
                defaultValue={recurring?.start_date ?? ""}
              />
              <p className="text-xs text-muted-foreground">Cũng là ngày ghi mỗi kỳ.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="recurring-end">
                Ngày kết thúc
              </label>
              <Input
                id="recurring-end"
                name="end_date"
                type="date"
                defaultValue={recurring?.end_date ?? ""}
              />
              <p className="text-xs text-muted-foreground">Bỏ trống nếu chưa hẹn ngày dừng.</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="recurring-note">
              Ghi chú
            </label>
            <Input
              id="recurring-note"
              name="note"
              placeholder="VD: hợp đồng thuê nhà 2 năm"
              defaultValue={recurring?.note ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={pending || !categoryId || (!lockedBranchId && !branchId)}
            >
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
