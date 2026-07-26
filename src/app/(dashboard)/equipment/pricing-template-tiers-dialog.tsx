"use client";

import { useRef, useState, useTransition } from "react";
import { ListTree } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createPricingTier, deletePricingTier } from "@/lib/actions/equipment";
import { RENTAL_PERIOD_UNIT_LABELS } from "@/lib/equipment-labels";
import type { RentalPeriodUnit } from "@/types/database";

interface Tier {
  id: string;
  min_duration: number;
  duration_unit: RentalPeriodUnit;
  discount_percentage: number;
}

interface PricingTemplateTiersDialogProps {
  templateId: string;
  templateName: string;
  tiers: Tier[];
}

export function PricingTemplateTiersDialog({
  templateId,
  templateName,
  tiers,
}: PricingTemplateTiersDialogProps) {
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = (
    <Button variant="ghost" size="icon-sm">
      <ListTree className="size-4" />
      <span className="sr-only">Quản lý bậc giá</span>
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleAddTier(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createPricingTier(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        formRef.current?.reset();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bậc giá — {templateName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          % giảm áp thẳng trên tổng tiền thuê tuyến tính (giá 1 đơn vị × số đơn vị thời gian),
          khi thuê đạt từ mức tương ứng trở lên.
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Từ</TableHead>
              <TableHead>% giảm</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((tier) => (
              <TableRow key={tier.id}>
                <TableCell>
                  {tier.min_duration} {RENTAL_PERIOD_UNIT_LABELS[tier.duration_unit]}
                </TableCell>
                <TableCell>{tier.discount_percentage}%</TableCell>
                <TableCell>
                  <ConfirmDeleteButton
                    confirmMessage={`Xoá bậc giá "${tier.min_duration} ${RENTAL_PERIOD_UNIT_LABELS[tier.duration_unit]}"?`}
                    successMessage="Đã xoá bậc giá."
                    action={deletePricingTier}
                    actionArg={tier.id}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!tiers.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Chưa có bậc giá nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <form ref={formRef} action={handleAddTier} className="space-y-3 border-t pt-4">
          <input type="hidden" name="template_id" value={templateId} />
          <p className="text-sm font-medium">Thêm bậc giá</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="min_duration">Từ</Label>
              <Input
                id="min_duration"
                name="min_duration"
                type="number"
                min={1}
                defaultValue={1}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_unit">Đơn vị</Label>
              <Select name="duration_unit" defaultValue="day">
                <SelectTrigger id="duration_unit" className="w-full">
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
            <div className="space-y-2">
              <Label htmlFor="discount_percentage">% giảm</Label>
              <Input
                id="discount_percentage"
                name="discount_percentage"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                placeholder="VD: 10"
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Đang thêm..." : "Thêm bậc giá"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
