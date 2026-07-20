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
import { createEquipmentUnit, updateEquipmentUnit } from "@/lib/actions/equipment";

interface EquipmentUnitDialogProps {
  trigger: React.ReactNode;
  equipmentTypeId: string;
  unit?: {
    id: string;
    brand_model: string;
    quantity_total: number;
    quantity_available: number;
    condition_notes: string | null;
  };
}

export function EquipmentUnitDialog({
  trigger,
  equipmentTypeId,
  unit,
}: EquipmentUnitDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = unit
        ? await updateEquipmentUnit(unit.id, undefined, formData)
        : await createEquipmentUnit(undefined, formData);

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
          <input type="hidden" name="equipment_type_id" value={equipmentTypeId} />
          <DialogHeader>
            <DialogTitle>{unit ? "Sửa biến thể" : "Thêm biến thể"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="brand_model">Hãng / model</Label>
            <Input
              id="brand_model"
              name="brand_model"
              defaultValue={unit?.brand_model}
              placeholder="VD: Samsung"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity_total">Tổng số lượng</Label>
              <Input
                id="quantity_total"
                name="quantity_total"
                type="number"
                min={0}
                defaultValue={unit?.quantity_total ?? 0}
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
                defaultValue={unit?.quantity_available ?? 0}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition_notes">Ghi chú tình trạng</Label>
            <Input
              id="condition_notes"
              name="condition_notes"
              defaultValue={unit?.condition_notes ?? ""}
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
