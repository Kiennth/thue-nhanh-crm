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
import { disposeEquipmentInstance } from "@/lib/actions/equipment";

interface EquipmentInstanceDisposeDialogProps {
  trigger: React.ReactElement;
  instanceId: string;
  identifierCode: string;
}

export function EquipmentInstanceDisposeDialog({
  trigger,
  instanceId,
  identifierCode,
}: EquipmentInstanceDisposeDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await disposeEquipmentInstance(instanceId, undefined, formData);
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
            <DialogTitle>Thanh lý &quot;{identifierCode}&quot;</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="disposal_price">Giá bán thu được</Label>
            <Input
              id="disposal_price"
              name="disposal_price"
              type="number"
              min={0}
              step={1000}
              required
            />
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Đang lưu..." : "Xác nhận thanh lý"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
