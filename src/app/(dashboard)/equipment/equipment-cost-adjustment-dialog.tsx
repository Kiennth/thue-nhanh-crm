"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
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
import { adjustEquipmentUnitCost } from "@/lib/actions/equipment";

interface BranchStock {
  branch_id: string;
  branch_name: string;
  quantity_in_stock: number;
}

interface EquipmentCostAdjustmentDialogProps {
  equipmentUnitId: string;
  branchStocks: BranchStock[];
}

// Trigger dựng ngay trong component này (không nhận qua prop từ Server
// Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
export function EquipmentCostAdjustmentDialog({
  equipmentUnitId,
  branchStocks,
}: EquipmentCostAdjustmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await adjustEquipmentUnitCost(undefined, formData);
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
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={!branchStocks.length}>
            <Tag className="size-4" />
            Điều chỉnh giá vốn
          </Button>
        }
      />
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="equipment_unit_id" value={equipmentUnitId} />
          <DialogHeader>
            <DialogTitle>Điều chỉnh giá vốn</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Dùng khi hàng đã có sẵn trong kho (mua từ trước, chưa từng ghi nhận giá vốn) — chỉ gán
            giá vốn cho đúng số lượng đang có, không cộng thêm tồn kho. Nếu đang mua thêm hàng
            mới, dùng nút &quot;Mua hàng&quot;.
          </p>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            <Select name="branch_id">
              <SelectTrigger id="branch_id" className="w-full">
                <SelectValue placeholder="Chọn chi nhánh">
                  {(value: string) => {
                    const b = branchStocks.find((b) => b.branch_id === value);
                    return b ? `${b.branch_name} (${b.quantity_in_stock} đang có)` : undefined;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branchStocks.map((b) => (
                  <SelectItem key={b.branch_id} value={b.branch_id}>
                    {b.branch_name} ({b.quantity_in_stock} đang có)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit_cost">Giá vốn / đơn vị</Label>
            <Input id="unit_cost" name="unit_cost" type="number" min={0} step={1000} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" name="note" placeholder="Không bắt buộc" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu giá vốn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
