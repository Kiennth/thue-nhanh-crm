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
import {
  PRICING_METHOD_LABELS,
  PRODUCT_TYPE_LABELS,
  RENTAL_PERIOD_UNIT_LABELS,
  TRACKING_TYPE_LABELS,
} from "@/lib/equipment-labels";
import type {
  PricingMethod,
  ProductType,
  RentalPeriodUnit,
  TrackingType,
} from "@/types/database";

interface PricingTemplateOption {
  id: string;
  name: string;
}

interface EquipmentTypeDialogProps {
  trigger: React.ReactElement;
  templates: PricingTemplateOption[];
  equipmentType?: {
    id: string;
    name: string;
    product_type: ProductType;
    tracking_type: TrackingType | null;
    pricing_method: PricingMethod | null;
    price: number;
    rental_period_unit: RentalPeriodUnit | null;
    pricing_template_id: string | null;
    deposit_amount: number;
  };
}

const PRICE_LABEL: Record<ProductType, string> = {
  rental: "Giá thuê",
  sale: "Giá bán",
  service: "Giá dịch vụ",
};

export function EquipmentTypeDialog({
  trigger,
  templates,
  equipmentType,
}: EquipmentTypeDialogProps) {
  const isEdit = !!equipmentType;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [productType, setProductType] = useState<ProductType>(
    equipmentType?.product_type ?? "rental",
  );
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>(
    equipmentType?.pricing_method ?? "flat_fee",
  );

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
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Sửa hàng hoá" : "Thêm hàng hoá"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Tên</Label>
            <Input
              id="name"
              name="name"
              defaultValue={equipmentType?.name}
              placeholder="VD: TV 43inch 4K"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_type">Loại hàng hoá</Label>
            <Select
              name={isEdit ? undefined : "product_type"}
              value={productType}
              onValueChange={(value) => setProductType(value as ProductType)}
              disabled={isEdit}
            >
              <SelectTrigger id="product_type" className="w-full">
                <SelectValue>
                  {(value: ProductType) => PRODUCT_TYPE_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rental">Cho thuê</SelectItem>
                <SelectItem value="sale">Bán</SelectItem>
                <SelectItem value="service">Dịch vụ</SelectItem>
              </SelectContent>
            </Select>
            {isEdit && (
              <>
                {/* Select disabled loại bỏ input khỏi FormData — gửi giá trị qua hidden input riêng. */}
                <input type="hidden" name="product_type" value={productType} />
                <p className="text-xs text-muted-foreground">
                  Không đổi được loại hàng hoá sau khi tạo.
                </p>
              </>
            )}
          </div>

          {productType === "rental" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="tracking_type">Kiểu theo dõi tồn kho</Label>
                <Select
                  name={isEdit ? undefined : "tracking_type"}
                  defaultValue={equipmentType?.tracking_type ?? "quantity"}
                  disabled={isEdit}
                >
                  <SelectTrigger id="tracking_type" className="w-full">
                    <SelectValue>
                      {(value: TrackingType) => TRACKING_TYPE_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantity">Theo số lượng</SelectItem>
                    <SelectItem value="individual">Theo từng sản phẩm</SelectItem>
                  </SelectContent>
                </Select>
                {isEdit && (
                  <>
                    <input
                      type="hidden"
                      name="tracking_type"
                      value={equipmentType?.tracking_type ?? "quantity"}
                    />
                    <p className="text-xs text-muted-foreground">
                      Không đổi được kiểu theo dõi sau khi tạo.
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">{PRICE_LABEL[productType]}</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min={0}
                    step={1000}
                    defaultValue={equipmentType?.price ?? 0}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rental_period_unit">Đơn vị thời gian</Label>
                  <Select
                    name="rental_period_unit"
                    defaultValue={equipmentType?.rental_period_unit ?? "day"}
                  >
                    <SelectTrigger id="rental_period_unit" className="w-full">
                      <SelectValue>
                        {(value: RentalPeriodUnit) => RENTAL_PERIOD_UNIT_LABELS[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Giờ</SelectItem>
                      <SelectItem value="day">Ngày</SelectItem>
                      <SelectItem value="week">Tuần</SelectItem>
                      <SelectItem value="month">Tháng</SelectItem>
                      <SelectItem value="year">Năm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deposit_amount">Tiền cọc / đơn vị</Label>
                <Input
                  id="deposit_amount"
                  name="deposit_amount"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={equipmentType?.deposit_amount ?? 0}
                />
                <p className="text-xs text-muted-foreground">
                  Thu cùng đơn (không tính VAT), hoàn lại sau khi nghiệm thu. Để 0 nếu không thu cọc.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pricing_method">Cách tính giá</Label>
                <Select
                  name="pricing_method"
                  value={pricingMethod}
                  onValueChange={(value) => setPricingMethod(value as PricingMethod)}
                >
                  <SelectTrigger id="pricing_method" className="w-full">
                    <SelectValue>
                      {(value: PricingMethod) => PRICING_METHOD_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat_fee">Giá cố định</SelectItem>
                    <SelectItem value="pricing_structure">Bảng giá mẫu</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pricingMethod === "pricing_structure" && (
                <div className="space-y-2">
                  <Label htmlFor="pricing_template_id">Bảng giá mẫu</Label>
                  {templates.length ? (
                    <Select
                      name="pricing_template_id"
                      defaultValue={equipmentType?.pricing_template_id ?? undefined}
                    >
                      <SelectTrigger id="pricing_template_id" className="w-full">
                        <SelectValue placeholder="Chọn bảng giá mẫu">
                          {(value: string) => templates.find((t) => t.id === value)?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Chưa có bảng giá mẫu nào — tạo ở mục &quot;Bảng giá mẫu&quot; phía trên trước.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {productType !== "rental" && (
            <div className="space-y-2">
              <Label htmlFor="price">{PRICE_LABEL[productType]}</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={0}
                step={1000}
                defaultValue={equipmentType?.price ?? 0}
                required
              />
            </div>
          )}

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
