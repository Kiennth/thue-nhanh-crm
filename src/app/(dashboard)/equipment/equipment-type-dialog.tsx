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
import { createEquipmentType, updateEquipmentType } from "@/lib/actions/equipment";

interface Branch {
  id: string;
  name: string;
}

interface EquipmentTypeDialogProps {
  trigger: React.ReactNode;
  branches: Branch[];
  equipmentType?: {
    id: string;
    name: string;
    branch_id: string;
    rental_price_per_day: number;
  };
}

export function EquipmentTypeDialog({
  trigger,
  branches,
  equipmentType,
}: EquipmentTypeDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = equipmentType
        ? await updateEquipmentType(equipmentType.id, undefined, formData)
        : await createEquipmentType(undefined, formData);

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
      <DialogTrigger render={<span />}>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {equipmentType ? "Sửa loại thiết bị" : "Thêm loại thiết bị"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Tên loại thiết bị</Label>
            <Input
              id="name"
              name="name"
              defaultValue={equipmentType?.name}
              placeholder="VD: TV 43inch 4K"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh sở hữu</Label>
            <Select name="branch_id" defaultValue={equipmentType?.branch_id ?? undefined}>
              <SelectTrigger id="branch_id" className="w-full">
                <SelectValue placeholder="Chọn chi nhánh" />
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
            <Label htmlFor="rental_price_per_day">Giá thuê / ngày (VNĐ)</Label>
            <Input
              id="rental_price_per_day"
              name="rental_price_per_day"
              type="number"
              min={0}
              step={1000}
              defaultValue={equipmentType?.rental_price_per_day ?? 0}
              required
            />
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
