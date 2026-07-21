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
import { createBranch, updateBranch } from "@/lib/actions/branches";

interface BranchDialogProps {
  trigger: React.ReactElement;
  branch?: {
    id: string;
    name: string;
    min_wage_region: string | null;
    is_active: boolean;
  };
}

export function BranchDialog({ trigger, branch }: BranchDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = branch ? updateBranch.bind(null, branch.id) : createBranch;
      const result = await action(undefined, formData);
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
            <DialogTitle>{branch ? "Sửa chi nhánh" : "Thêm chi nhánh"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Tên chi nhánh</Label>
            <Input id="name" name="name" defaultValue={branch?.name} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="min_wage_region">Vùng lương tối thiểu</Label>
            <Input
              id="min_wage_region"
              name="min_wage_region"
              defaultValue={branch?.min_wage_region ?? ""}
              placeholder="VD: Vùng I"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={branch?.is_active ?? true}
              className="size-4"
            />
            Đang hoạt động
          </label>

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
