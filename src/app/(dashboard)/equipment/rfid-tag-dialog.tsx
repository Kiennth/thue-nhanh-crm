"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { createRfidTag, deleteRfidTag } from "@/lib/actions/rfid";

interface RfidTagDialogProps {
  trigger: React.ReactElement;
  label: string;
  equipmentTypeId: string;
  equipmentUnitId?: string;
  equipmentInstanceId?: string;
  tags: { id: string; tag_code: string }[];
}

export function RfidTagDialog({
  trigger,
  label,
  equipmentTypeId,
  equipmentUnitId,
  equipmentInstanceId,
  tags,
}: RfidTagDialogProps) {
  const [open, setOpen] = useState(false);
  const [tagCode, setTagCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Hàng theo dõi số lượng: nhiều tag (mỗi tag = 1 sản phẩm vật lý). Hàng theo
  // dõi riêng lẻ: tối đa 1 tag/sản phẩm (rfid_tags_instance_unique).
  const canAddMore = !!equipmentUnitId || tags.length === 0;

  function handleAdd() {
    if (!tagCode.trim()) return;
    setError(null);

    const formData = new FormData();
    formData.set("tag_code", tagCode.trim());
    formData.set("equipment_type_id", equipmentTypeId);
    if (equipmentUnitId) formData.set("equipment_unit_id", equipmentUnitId);
    if (equipmentInstanceId) formData.set("equipment_instance_id", equipmentInstanceId);

    startTransition(async () => {
      const result = await createRfidTag(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setTagCode("");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteRfidTag(id);
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
          <DialogTitle>Tag RFID — {label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-mono">{tag.tag_code}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(tag.id)}
                disabled={pending}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Xoá tag</span>
              </Button>
            </div>
          ))}
          {!tags.length && <p className="text-sm text-muted-foreground">Chưa có tag nào.</p>}
        </div>

        {canAddMore && (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Quét hoặc nhập mã tag"
              value={tagCode}
              onChange={(e) => setTagCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              autoFocus
            />
            <Button type="button" onClick={handleAdd} disabled={pending || !tagCode.trim()}>
              <Plus className="size-4" />
              Thêm
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
