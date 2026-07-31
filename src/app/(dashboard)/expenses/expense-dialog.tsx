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
import { Pencil, Plus } from "lucide-react";
import { createExpense, updateExpense, type ActionState } from "@/lib/actions/expenses";

// KHÔNG dùng toISOString(): nó trả ngày UTC — 1h sáng ở Việt Nam sẽ điền
// nhầm thành ngày hôm trước. Ghép tay theo giờ máy người dùng.
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ExpenseForEdit {
  id: string;
  branch_id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  note: string | null;
}

export function ExpenseDialog({
  branches,
  categories,
  // Cửa hàng trưởng bị khoá về kho mình: truyền lockedBranchId để ẩn ô chọn
  // chi nhánh (server + RLS vẫn kiểm tra lại, đây chỉ là phần giao diện).
  lockedBranchId,
  expense,
}: {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  lockedBranchId?: string | null;
  expense?: ExpenseForEdit;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!expense;

  const [branchId, setBranchId] = useState(expense?.branch_id ?? lockedBranchId ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("branch_id", lockedBranchId ?? branchId);
    formData.set("category_id", categoryId);
    startTransition(async () => {
      const result: ActionState = isEdit
        ? await updateExpense(expense.id, undefined, formData)
        : await createExpense(undefined, formData);
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
            <Button variant="ghost" size="icon" aria-label="Sửa khoản chi">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>
              <Plus className="size-4" /> Thêm khoản chi
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa khoản chi" : "Thêm khoản chi"}</DialogTitle>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="expense-amount">
                Số tiền (đ)
              </label>
              <Input
                id="expense-amount"
                name="amount"
                type="number"
                min={0}
                step={1000}
                required
                defaultValue={expense?.amount ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="expense-date">
                Ngày chi
              </label>
              <Input
                id="expense-date"
                name="expense_date"
                type="date"
                required
                defaultValue={expense?.expense_date ?? todayLocal()}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="expense-note">
              Ghi chú
            </label>
            <Input
              id="expense-note"
              name="note"
              placeholder="VD: hoá đơn điện tháng 7"
              defaultValue={expense?.note ?? ""}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={pending || !categoryId || (!lockedBranchId && !branchId)}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
