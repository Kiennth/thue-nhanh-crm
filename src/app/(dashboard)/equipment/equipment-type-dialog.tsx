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
import {
  createEquipmentType,
  removeEquipmentTypeImage,
  updateEquipmentType,
} from "@/lib/actions/equipment";
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

interface CategoryOption {
  id: string;
  name: string;
}

// Danh mục tuỳ chọn — "Chưa phân loại" là sentinel để rewrite thành rỗng
// trước khi gửi, cùng pattern với equipment-instance-dialog.tsx (biến thể).
const NO_CATEGORY = "__no_category__";

interface EquipmentTypeDialogProps {
  templates: PricingTemplateOption[];
  categories: CategoryOption[];
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
    image_url: string | null;
    payout_percentage: number | null;
    category_id: string | null;
  };
  // Biến thể nút "Sửa" — icon-only ở bảng danh sách (mặc định), outline có
  // chữ ở trang chi tiết.
  editTriggerVariant?: "icon" | "outline";
}

const PRICE_LABEL: Record<ProductType, string> = {
  rental: "Giá thuê",
  sale: "Giá bán",
  service: "Giá dịch vụ",
};

export function EquipmentTypeDialog({
  templates,
  categories,
  equipmentType,
  editTriggerVariant = "icon",
}: EquipmentTypeDialogProps) {
  const isEdit = !!equipmentType;
  // Nút trigger dựng NGAY TRONG client component này (không nhận qua prop từ
  // Server Component như trước) — nhận qua prop gây lệch hydration ở
  // data-slot của DialogTrigger/Button (mismatch "dialog-trigger" server vs
  // "button" client), vì phần tử JSX phải xuyên qua ranh giới RSC trước khi
  // Base UI merge props vào. Dựng nội bộ như ConfirmDeleteButton (không bao
  // giờ lỗi này) thì tránh được.
  const trigger = !isEdit ? (
    <Button>
      <Plus className="size-4" />
      Thêm hàng hoá
    </Button>
  ) : editTriggerVariant === "outline" ? (
    <Button variant="outline" size="sm">
      <Pencil className="size-4" />
      Sửa
    </Button>
  ) : (
    <Button variant="ghost" size="icon-sm">
      <Pencil className="size-4" />
      <span className="sr-only">Sửa</span>
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [productType, setProductType] = useState<ProductType>(
    equipmentType?.product_type ?? "rental",
  );
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>(
    equipmentType?.pricing_method ?? "flat_fee",
  );
  const [imagePreview, setImagePreview] = useState<string | null>(
    equipmentType?.image_url ?? null,
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    if (formData.get("category_id") === NO_CATEGORY) {
      formData.delete("category_id");
    }
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

  function handleRemoveImage() {
    if (!equipmentType) return;
    startTransition(async () => {
      await removeEquipmentTypeImage(equipmentType.id);
      setImagePreview(null);
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
            <Label htmlFor="category_id">Danh mục</Label>
            <Select name="category_id" defaultValue={equipmentType?.category_id ?? NO_CATEGORY}>
              <SelectTrigger id="category_id" className="w-full">
                <SelectValue placeholder="Chưa phân loại">
                  {(value: string) =>
                    value === NO_CATEGORY
                      ? "Chưa phân loại"
                      : (categories.find((c) => c.id === value)?.name ?? "—")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Ảnh đại diện</Label>
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt=""
                className="h-24 w-24 rounded-lg border object-cover"
              />
            )}
            <Input
              id="image"
              name="image"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImagePreview(URL.createObjectURL(file));
              }}
            />
            {isEdit && equipmentType?.image_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveImage}
                disabled={pending}
              >
                Xoá ảnh
              </Button>
            )}
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

          {productType === "service" && (
            <div className="space-y-2">
              <Label htmlFor="payout_percentage">% trả trực tiếp cho người thực hiện</Label>
              <Input
                id="payout_percentage"
                name="payout_percentage"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={equipmentType?.payout_percentage ?? ""}
                placeholder="Để trống nếu tính theo quỹ khoán chung"
              />
              <p className="text-xs text-muted-foreground">
                VD: Lắp đặt/Tháo dỡ = 100%, Hỗ trợ kỹ thuật = 50%. Bỏ trống thì dòng này vẫn tính
                khoán theo quỹ chung như các dòng khác.
              </p>
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
