"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createPurchaseOrder } from "@/lib/actions/purchases";

export function NewPurchaseDialog({
  suppliers,
  branches,
  defaultBranchId,
  lockBranch,
  today,
  defaultSupplierId,
}: {
  suppliers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  defaultBranchId: string;
  lockBranch: boolean;
  today: string;
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await createPurchaseOrder({
        supplierId: String(fd.get("supplier") ?? ""),
        branchId: String(fd.get("branch") ?? ""),
        orderDate: String(fd.get("date") ?? ""),
        supplierInvoiceNo: String(fd.get("invoice") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.push(`/purchases/${r.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" /> Tạo phiếu mua
          </Button>
        }
      />
      <DialogContent>
        <form action={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Tạo phiếu mua hàng</DialogTitle>
          </DialogHeader>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có nhà cung cấp nào. Vào mục <b>Nhà cung cấp</b> thêm trước rồi quay lại.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="po_supplier">Nhà cung cấp</Label>
                <select
                  id="po_supplier"
                  name="supplier"
                  required
                  defaultValue={defaultSupplierId ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="" disabled>
                    — chọn nhà cung cấp —
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="po_branch">Nhập về kho</Label>
                  <select
                    id="po_branch"
                    name="branch"
                    defaultValue={defaultBranchId}
                    disabled={lockBranch}
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {lockBranch && <input type="hidden" name="branch" value={defaultBranchId} />}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="po_date">Ngày mua</Label>
                  <Input id="po_date" name="date" type="date" defaultValue={today} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="po_invoice">Số hoá đơn / chứng từ của NCC (nếu có)</Label>
                <Input id="po_invoice" name="invoice" placeholder="Có thể điền sau" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="po_note">Ghi chú</Label>
                <Input id="po_note" name="note" placeholder="Mua cho đơn nào, điều kiện bảo hành…" />
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || suppliers.length === 0}>
              {pending ? "Đang tạo…" : "Tạo phiếu & thêm hàng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
