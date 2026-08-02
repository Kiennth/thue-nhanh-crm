"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { addCustomOrderLine, addOrderEquipmentLine } from "@/lib/actions/orders";
import { equipmentInstanceLabel } from "@/lib/equipment-labels";
import type { ProductType, TrackingType } from "@/types/database";

interface EquipmentTypeOption {
  id: string;
  name: string;
  product_type: ProductType;
  tracking_type: TrackingType | null;
}

interface EquipmentUnitOption {
  id: string;
  equipment_type_id: string;
  brand_model: string;
}

interface EquipmentInstanceOption {
  id: string;
  equipment_type_id: string;
  // Biến thể tuỳ chọn — null với đa số máy (xem migration 20260802040000).
  equipment_unit_id: string | null;
  identifier_code: string;
  status: string;
}

interface AddOrderLineDialogProps {
  orderId: string;
  equipmentTypes: EquipmentTypeOption[];
  equipmentUnits: EquipmentUnitOption[];
  equipmentInstances: EquipmentInstanceOption[];
}

export function AddOrderLineDialog({
  orderId,
  equipmentTypes,
  equipmentUnits,
  equipmentInstances,
}: AddOrderLineDialogProps) {
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = (
    <Button variant="outline" size="sm">
      <Plus className="size-4" />
      Thêm dòng hàng
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [equipmentTypeId, setEquipmentTypeId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [instanceId, setInstanceId] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);

  const selectedType = equipmentTypes.find((t) => t.id === equipmentTypeId);
  const isRental = selectedType?.product_type === "rental";
  const isIndividual = isRental && selectedType?.tracking_type === "individual";
  const isQuantityBased = selectedType && (selectedType.product_type === "sale" || (isRental && !isIndividual));

  const unitOptions = useMemo(
    () => equipmentUnits.filter((u) => u.equipment_type_id === equipmentTypeId),
    [equipmentUnits, equipmentTypeId],
  );
  // Không lọc theo equipmentTypeId — chỉ dùng để tra tên biến thể của từng
  // máy serialize (đa số máy sẽ không có biến thể, tra ra undefined là bình
  // thường).
  const unitById = useMemo(
    () => new Map(equipmentUnits.map((u) => [u.id, u])),
    [equipmentUnits],
  );
  const instanceOptions = useMemo(
    () =>
      equipmentInstances.filter(
        (i) => i.equipment_type_id === equipmentTypeId && i.status === "available",
      ),
    [equipmentInstances, equipmentTypeId],
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "custom"
          ? await addCustomOrderLine(undefined, formData)
          : await addOrderEquipmentLine(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setEquipmentTypeId("");
        setUnitId("");
        setInstanceId("");
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
        <DialogHeader>
          <DialogTitle>Thêm dòng hàng</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "catalog" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("catalog");
              setError(null);
            }}
          >
            Từ danh mục
          </Button>
          <Button
            type="button"
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("custom");
              setError(null);
            }}
          >
            Dòng tự do
          </Button>
        </div>

        {mode === "custom" ? (
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <input type="hidden" name="order_id" value={orderId} />

            <div className="space-y-2">
              <Label htmlFor="custom_name">Tên</Label>
              <Input id="custom_name" name="custom_name" placeholder="Vd: Phí sạc pin, phí gửi xe..." required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_quantity">Số lượng</Label>
              <Input id="custom_quantity" name="quantity" type="number" min={1} defaultValue={1} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_unit_price">Đơn giá (đ)</Label>
              <Input id="custom_unit_price" name="unit_price" type="number" min={0} step={1000} defaultValue={0} required />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={pending}>
              {pending ? "Đang thêm..." : "Thêm dòng hàng"}
            </Button>
          </form>
        ) : (
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />

          <div className="space-y-2">
            <Label htmlFor="equipment_type_id">Hàng hoá</Label>
            <Select
              name="equipment_type_id"
              value={equipmentTypeId}
              onValueChange={(value) => {
                setEquipmentTypeId(value ?? "");
                setUnitId("");
                setInstanceId("");
              }}
            >
              <SelectTrigger id="equipment_type_id" className="w-full">
                <SelectValue placeholder="Chọn hàng hoá">
                  {(value: string) => equipmentTypes.find((t) => t.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {equipmentTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isRental && (
              <p className="text-xs text-muted-foreground">
                Giá tính theo thời gian thuê chung của cả đơn (xem mục &quot;Thời gian thuê&quot;
                phía trên).
              </p>
            )}
          </div>

          {/* Đa số loại hàng chỉ có 0-1 biến thể — ẩn ô này đi: 1 biến thể
              thì tự chọn (hidden input), 0 biến thể thì server tự tạo ngầm
              biến thể mặc định trùng tên sản phẩm. Chỉ hiện selector khi có
              nhiều biến thể thật để chọn. */}
          {isQuantityBased && unitOptions.length === 1 && (
            <input type="hidden" name="equipment_unit_id" value={unitOptions[0].id} />
          )}
          {isQuantityBased && unitOptions.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="equipment_unit_id">Biến thể</Label>
              <Select
                name="equipment_unit_id"
                value={unitId}
                onValueChange={(value) => setUnitId(value ?? "")}
              >
                <SelectTrigger id="equipment_unit_id" className="w-full">
                  <SelectValue placeholder="Chọn biến thể">
                    {(value: string) => unitOptions.find((u) => u.id === value)?.brand_model}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.brand_model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isIndividual && (
            <div className="space-y-2">
              <Label htmlFor="equipment_instance_id">Sản phẩm</Label>
              {instanceOptions.length ? (
                <Select
                  name="equipment_instance_id"
                  value={instanceId}
                  onValueChange={(value) => setInstanceId(value ?? "")}
                >
                  <SelectTrigger id="equipment_instance_id" className="w-full">
                    <SelectValue placeholder="Chọn sản phẩm">
                      {(value: string) => {
                        const inst = instanceOptions.find((i) => i.id === value);
                        if (!inst) return undefined;
                        const unitName = inst.equipment_unit_id
                          ? unitById.get(inst.equipment_unit_id)?.brand_model
                          : null;
                        return equipmentInstanceLabel(unitName, inst.identifier_code);
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {instanceOptions.map((i) => {
                      const unitName = i.equipment_unit_id
                        ? unitById.get(i.equipment_unit_id)?.brand_model
                        : null;
                      return (
                        <SelectItem key={i.id} value={i.id}>
                          {equipmentInstanceLabel(unitName, i.identifier_code)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Không còn sản phẩm sẵn có.</p>
              )}
              <input type="hidden" name="quantity" value={1} />
            </div>
          )}

          {!isIndividual && (
            <div className="space-y-2">
              <Label htmlFor="quantity">Số lượng</Label>
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} required />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || !equipmentTypeId}>
            {pending ? "Đang thêm..." : "Thêm dòng hàng"}
          </Button>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
