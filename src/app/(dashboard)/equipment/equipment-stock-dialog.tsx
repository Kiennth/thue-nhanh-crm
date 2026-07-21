"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { upsertEquipmentStock } from "@/lib/actions/equipment";

interface Branch {
  id: string;
  name: string;
}

interface EquipmentStockDialogProps {
  trigger: React.ReactElement;
  equipmentUnitId: string;
  branches: Branch[];
  stock?: {
    branch_id: string;
    quantity_total: number;
    quantity_available: number;
  };
}

export function EquipmentStockDialog({
  trigger,
  equipmentUnitId,
  branches,
  stock,
}: EquipmentStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertEquipmentStock(undefined, formData);

      if (result && "error" in result) {
        setError(result.error);
      } else {
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
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="equipment_unit_id" value={equipmentUnitId} />
          <DialogHeader>
            <DialogTitle>
              {stock ? "Sửa tồn kho theo chi nhánh" : "Thêm tồn kho theo chi nhánh"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            {stock ? (
              <>
                <input type="hidden" name="branch_id" value={stock.branch_id} />
                <p className="text-sm text-muted-foreground">
                  {branches.find((b) => b.id === stock.branch_id)?.name ?? "—"}
                </p>
              </>
            ) : (
              <Select name="branch_id">
                <SelectTrigger id="branch_id" className="w-full">
                  <SelectValue placeholder="Chọn chi nhánh">
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
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity_total">Tổng số lượng</Label>
              <Input
                id="quantity_total"
                name="quantity_total"
                type="number"
                min={0}
                defaultValue={stock?.quantity_total ?? 0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity_available">Số lượng sẵn có</Label>
              <Input
                id="quantity_available"
                name="quantity_available"
                type="number"
                min={0}
                defaultValue={stock?.quantity_available ?? 0}
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
