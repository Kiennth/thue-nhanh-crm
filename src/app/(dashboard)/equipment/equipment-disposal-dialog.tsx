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
import { createEquipmentDisposal } from "@/lib/actions/equipment";

interface Branch {
  id: string;
  name: string;
}

interface EquipmentDisposalDialogProps {
  trigger: React.ReactElement;
  equipmentUnitId: string;
  branches: Branch[];
}

export function EquipmentDisposalDialog({
  trigger,
  equipmentUnitId,
  branches,
}: EquipmentDisposalDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createEquipmentDisposal(undefined, formData);
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
            <DialogTitle>Bán / thanh lý</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh xuất kho</Label>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Số lượng bán</Label>
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_price">Giá bán / đơn vị</Label>
              <Input id="unit_price" name="unit_price" type="number" min={0} step={1000} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disposal_date">Ngày bán</Label>
            <Input
              id="disposal_date"
              name="disposal_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" name="note" placeholder="Không bắt buộc" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Đang lưu..." : "Ghi nhận bán/thanh lý"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
