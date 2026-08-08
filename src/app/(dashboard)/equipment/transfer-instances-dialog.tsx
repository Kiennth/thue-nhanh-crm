"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transferEquipmentInstances } from "@/lib/actions/equipment";

interface Branch {
  id: string;
  name: string;
}

interface TransferableInstance {
  id: string;
  identifier_code: string;
  branch_id: string | null;
  branchName: string;
}

// Chuyển kho nhanh cho hàng serialized — tick nhiều máy chuyển 1 lượt sang
// chi nhánh khác, thay vì mở "Sửa" đổi chi nhánh từng máy (CEO yêu cầu
// 2026-08-08). Chỉ nhận máy chuyển được (available/maintenance — page.tsx
// lọc sẵn, action kiểm tra lại). Máy đã ở đúng chi nhánh đích tự mờ đi khi
// chọn đích để không tick nhầm.
export function TransferInstancesDialog({
  equipmentTypeId,
  branches,
  instances,
}: {
  equipmentTypeId: string;
  branches: Branch[];
  instances: TransferableInstance[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toBranchId, setToBranchId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // Máy đã nằm ở chi nhánh đích không có gì để chuyển — loại khỏi danh sách
  // tick được (và khỏi "Chọn tất cả").
  const selectable = toBranchId
    ? instances.filter((i) => i.branch_id !== toBranchId)
    : instances;
  const allSelected = selectable.length > 0 && selectable.every((i) => selectedIds.has(i.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectable.map((i) => i.id)));
  }

  function handleTargetChange(value: string | null) {
    setToBranchId(value);
    // Bỏ tick những máy đã ở chi nhánh đích mới chọn — tránh submit nhầm.
    if (value) {
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const i of instances) {
          if (prev.has(i.id) && i.branch_id !== value) next.add(i.id);
        }
        return next;
      });
    }
  }

  function handleSubmit() {
    if (!toBranchId) {
      setError("Vui lòng chọn chi nhánh đích.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("Chọn ít nhất 1 sản phẩm để chuyển.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await transferEquipmentInstances(equipmentTypeId, toBranchId, [...selectedIds]);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
        setSelectedIds(new Set());
        setToBranchId(null);
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
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowLeftRight className="size-4" />
            Chuyển kho
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển kho nhiều máy</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="to_branch_id">Đến chi nhánh</Label>
          <Select name="to_branch_id" value={toBranchId} onValueChange={handleTargetChange}>
            <SelectTrigger id="to_branch_id" className="w-full">
              <SelectValue placeholder="Chọn chi nhánh đích">
                {(value: string) => branches.find((b) => b.id === value)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Chọn máy ({selectedIds.size}/{selectable.length})</Label>
            {selectable.length > 1 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:underline"
              >
                {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>
            )}
          </div>
          {instances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Không có máy nào chuyển được (máy đang cho thuê phải thu hồi xong mới chuyển).
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {instances.map((inst) => {
                const disabled = toBranchId != null && inst.branch_id === toBranchId;
                return (
                  <li key={inst.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted ${
                        disabled ? "cursor-not-allowed opacity-40" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selectedIds.has(inst.id)}
                        disabled={disabled}
                        onChange={() => toggle(inst.id)}
                      />
                      <span className="font-medium">{inst.identifier_code}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {disabled ? "đã ở chi nhánh đích" : inst.branchName}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={pending || instances.length === 0}>
            {pending ? "Đang chuyển..." : `Chuyển ${selectedIds.size} máy`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
