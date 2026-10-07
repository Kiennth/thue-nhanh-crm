"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, PackagePlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [kind, setKind] = useState<"new" | "backfill">("new");

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await createPurchaseOrder({
        supplierId: String(fd.get("supplier") ?? ""),
        branchId: String(fd.get("branch") ?? ""),
        orderDate: String(fd.get("date") ?? ""),
        supplierInvoiceNo: String(fd.get("invoice") ?? ""),
        note: String(fd.get("note") ?? ""),
        kind,
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
              {/* Loại phiếu: mua mới (nhập kho) hay ghi lại máy đã có (gắn NCC ngược). */}
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["new", PackagePlus, "Mua hàng mới", "Nhận hàng → nhập kho, tạo máy mới", "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"],
                    ["backfill", History, "Ghi lại hàng đã có", "Gắn NCC + giá mua cho máy đang có", "border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200"],
                  ] as const
                ).map(([k, Icon, title, sub, on]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition",
                      kind === k ? on : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <Icon className="mb-1 size-5" />
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs opacity-75">{sub}</p>
                  </button>
                ))}
              </div>
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
                  <Label htmlFor="po_branch">{kind === "new" ? "Nhập về kho" : "Kho (ghi sổ)"}</Label>
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
                  <Label htmlFor="po_date">{kind === "new" ? "Ngày mua" : "Ngày mua thực tế"}</Label>
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
              {pending ? "Đang tạo…" : kind === "new" ? "Tạo phiếu & thêm hàng" : "Tạo phiếu & chọn máy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
