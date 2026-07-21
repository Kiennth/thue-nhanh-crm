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
import { transferEquipmentStock } from "@/lib/actions/equipment";

interface Branch {
  id: string;
  name: string;
}

interface TransferStockDialogProps {
  trigger: React.ReactElement;
  equipmentUnitId: string;
  branches: Branch[];
}

export function TransferStockDialog({
  trigger,
  equipmentUnitId,
  branches,
}: TransferStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await transferEquipmentStock(undefined, formData);

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
            <DialogTitle>Chuyển kho</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="from_branch_id">Từ chi nhánh</Label>
            <Select name="from_branch_id">
              <SelectTrigger id="from_branch_id" className="w-full">
                <SelectValue placeholder="Chọn chi nhánh nguồn">
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
            <Label htmlFor="to_branch_id">Đến chi nhánh</Label>
            <Select name="to_branch_id">
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
            <Label htmlFor="quantity">Số lượng chuyển</Label>
            <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" name="note" placeholder="Không bắt buộc" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang chuyển..." : "Chuyển kho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
