"use client";

import { useRef, useState, useTransition } from "react";
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
import { createCommissionTier } from "@/lib/actions/commission";

export function CommissionTierDialog({
  branchId,
  nextTierNumber,
}: {
  branchId: string;
  nextTierNumber: number;
}) {
  // Trigger dựng ngay trong component này (không nhận qua prop từ Server
  // Component) — xem ghi chú tương tự ở equipment-type-dialog.tsx.
  const trigger = (
    <Button variant="outline" size="sm">
      <Plus className="size-4" />
      Thêm bậc
    </Button>
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCommissionTier(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
        formRef.current?.reset();
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
          <DialogTitle>Thêm bậc hoa hồng</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="tier_number" value={nextTierNumber} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="min_value">Từ giá trị đơn</Label>
              <Input id="min_value" name="min_value" type="number" min={0} step={1000} defaultValue={0} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_value">Đến (để trống = không giới hạn)</Label>
              <Input id="max_value" name="max_value" type="number" min={0} step={1000} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="percentage">% hoa hồng</Label>
            <Input
              id="percentage"
              name="percentage"
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              placeholder="VD: 4"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
