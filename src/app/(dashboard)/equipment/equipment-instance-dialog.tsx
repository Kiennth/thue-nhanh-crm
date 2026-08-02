"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { createEquipmentInstance, updateEquipmentInstance } from "@/lib/actions/equipment";
import { EQUIPMENT_INSTANCE_STATUS_LABELS } from "@/lib/equipment-labels";
import type { EquipmentInstanceStatus } from "@/types/database";

interface Branch {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  brand_model: string;
}

// Biến thể tuỳ chọn — đa số loại hàng chưa cần (danh sách rỗng thì ẩn hẳn ô
// này, xem bên dưới). "Không có biến thể" là sentinel để rewrite thành rỗng
// trước khi gửi, cùng pattern với order-line-employee-form.tsx.
const NO_VARIANT = "__no_variant__";

interface EquipmentInstanceDialogProps {
  equipmentTypeId: string;
  branches: Branch[];
  units: UnitOption[];
  instance?: {
    id: string;
    equipment_unit_id: string | null;
    identifier_code: string;
    branch_id: string | null;
    status: EquipmentInstanceStatus;
    condition_notes: string | null;
    purchase_price: number | null;
    purchase_date: string | null;
  };
}

export function EquipmentInstanceDialog({
  equipmentTypeId,
  branches,
  units,
  instance,
}: EquipmentInstanceDialogProps) {
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = instance ? (
    <Button variant="ghost" size="icon-sm">
      <Pencil className="size-4" />
      <span className="sr-only">Sửa</span>
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Plus className="size-4" />
      Thêm sản phẩm
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    if (formData.get("equipment_unit_id") === NO_VARIANT) {
      formData.delete("equipment_unit_id");
    }
    startTransition(async () => {
      const result = instance
        ? await updateEquipmentInstance(instance.id, undefined, formData)
        : await createEquipmentInstance(undefined, formData);

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
          <input type="hidden" name="equipment_type_id" value={equipmentTypeId} />
          <DialogHeader>
            <DialogTitle>{instance ? "Sửa sản phẩm" : "Thêm sản phẩm"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="identifier_code">Mã định danh</Label>
            <Input
              id="identifier_code"
              name="identifier_code"
              placeholder="VD: biển số, số serial"
              defaultValue={instance?.identifier_code}
              required
            />
          </div>

          {units.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="equipment_unit_id">Biến thể</Label>
              <Select
                name="equipment_unit_id"
                defaultValue={instance?.equipment_unit_id ?? NO_VARIANT}
              >
                <SelectTrigger id="equipment_unit_id" className="w-full">
                  <SelectValue placeholder="Không có biến thể">
                    {(value: string) =>
                      value === NO_VARIANT
                        ? "Không có biến thể"
                        : (units.find((u) => u.id === value)?.brand_model ?? "—")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VARIANT}>Không có biến thể</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.brand_model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            <Select name="branch_id" defaultValue={instance?.branch_id ?? undefined}>
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

          <div className="space-y-2">
            <Label htmlFor="status">Trạng thái</Label>
            <Select name="status" defaultValue={instance?.status ?? "available"}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue>
                  {(value: EquipmentInstanceStatus) => EQUIPMENT_INSTANCE_STATUS_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Sẵn có</SelectItem>
                <SelectItem value="rented">Đang cho thuê</SelectItem>
                <SelectItem value="maintenance">Bảo trì</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition_notes">Ghi chú tình trạng</Label>
            <Input
              id="condition_notes"
              name="condition_notes"
              defaultValue={instance?.condition_notes ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="purchase_price">Giá mua</Label>
              <Input
                id="purchase_price"
                name="purchase_price"
                type="number"
                min={0}
                step={1000}
                defaultValue={instance?.purchase_price ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase_date">Ngày mua</Label>
              <Input
                id="purchase_date"
                name="purchase_date"
                type="date"
                defaultValue={instance?.purchase_date ?? ""}
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
