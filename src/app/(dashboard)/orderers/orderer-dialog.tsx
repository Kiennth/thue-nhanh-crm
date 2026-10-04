"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateOrderer } from "@/lib/actions/orderers";

export interface OrdererRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  notes: string | null;
}

export function OrdererDialog({ orderer }: { orderer: OrdererRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setError(null); }}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Pencil className="size-4" />
            Sửa hồ sơ
          </Button>
        }
      />
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const r = await updateOrderer(orderer.id, undefined, fd);
              if ("error" in r) setError(r.error);
              else {
                toast.success("Đã lưu hồ sơ người đặt");
                setOpen(false);
              }
            })
          }
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Sửa hồ sơ người đặt hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="o_name">Họ tên</Label>
            <Input id="o_name" name="name" defaultValue={orderer.name} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="o_phone">Số điện thoại</Label>
              <Input id="o_phone" name="phone" defaultValue={orderer.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o_email">Email</Label>
              <Input id="o_email" name="email" type="email" defaultValue={orderer.email ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="o_title">Vai trò / chỗ làm hiện tại</Label>
            <Input
              id="o_title"
              name="title"
              placeholder="vd: PM sự kiện ở Agency X, freelancer..."
              defaultValue={orderer.title ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="o_notes">Ghi chú chăm sóc</Label>
            <Textarea
              id="o_notes"
              name="notes"
              rows={4}
              placeholder="Sở thích, hay đặt gấp, sinh nhật, lần gọi gần nhất..."
              defaultValue={orderer.notes ?? ""}
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
