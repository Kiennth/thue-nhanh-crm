"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/create-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSupplier, updateSupplier } from "@/lib/actions/suppliers";

export type Supplier = {
  id: string;
  supplier_type: "company" | "individual";
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  products: string | null;
  notes: string | null;
  is_active: boolean;
};

// Gợi ý tên ngân hàng (vẫn gõ tự do được).
const BANKS = [
  "Vietcombank",
  "Techcombank",
  "BIDV",
  "VietinBank",
  "Agribank",
  "MB Bank",
  "ACB",
  "VPBank",
  "TPBank",
  "Sacombank",
  "VIB",
  "HDBank",
  "SHB",
  "OCB",
  "MSB",
  "SeABank",
  "Eximbank",
  "LPBank",
  "Nam A Bank",
  "Bac A Bank",
  "Cake by VPBank",
  "Timo",
];

export function SupplierDialog({ supplier }: { supplier?: Supplier }) {
  const isEdit = !!supplier;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [type, setType] = useState<Supplier["supplier_type"]>(supplier?.supplier_type ?? "company");
  const [active, setActive] = useState(supplier?.is_active ?? true);

  function submit(formData: FormData) {
    setError(null);
    formData.set("supplier_type", type);
    formData.set("is_active", active ? "on" : "off");
    start(async () => {
      const r = supplier ? await updateSupplier(supplier.id, formData) : await createSupplier(formData);
      if (r && "error" in r) {
        setError(r.error);
        return;
      }
      toast.success(supplier ? "Đã lưu nhà cung cấp." : "Đã thêm nhà cung cấp.");
      setOpen(false);
    });
  }

  const trigger = isEdit ? (
    <Button variant="ghost" size="icon-sm">
      <Pencil className="size-4" />
      <span className="sr-only">Sửa</span>
    </Button>
  ) : (
    <CreateButton label="Thêm nhà cung cấp" />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form action={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Loại nhà cung cấp</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["company", "Công ty"],
                  ["individual", "Cá nhân"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  aria-pressed={type === v}
                  className={cn(
                    "h-10 rounded-md border-2 text-sm font-semibold transition",
                    type === v
                      ? v === "company"
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-amber-500 bg-amber-500 text-white"
                      : v === "company"
                        ? "border-sky-200 text-sky-800 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                        : "border-amber-200 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="s_name">{type === "company" ? "Tên công ty / cửa hàng" : "Họ tên"}</Label>
              <Input id="s_name" name="name" defaultValue={supplier?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_phone">Số điện thoại</Label>
              <Input id="s_phone" name="phone" inputMode="tel" defaultValue={supplier?.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_tax">{type === "company" ? "Mã số thuế" : "Số CCCD"}</Label>
              <Input id="s_tax" name="tax_code" defaultValue={supplier?.tax_code ?? ""} />
            </div>
            {type === "company" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="s_contact">Người liên hệ</Label>
                  <Input id="s_contact" name="contact_name" placeholder="Anh/chị phụ trách" defaultValue={supplier?.contact_name ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s_email">Email</Label>
                  <Input id="s_email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="s_addr">Địa chỉ</Label>
              <Input id="s_addr" name="address" defaultValue={supplier?.address ?? ""} />
            </div>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <legend className="px-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Tài khoản ngân hàng</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s_acc">Số tài khoản</Label>
                <Input id="s_acc" name="bank_account_number" inputMode="numeric" defaultValue={supplier?.bank_account_number ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s_bank">Ngân hàng</Label>
                <Input id="s_bank" name="bank_name" list="s_banks" placeholder="Vietcombank, Techcombank…" defaultValue={supplier?.bank_name ?? ""} />
                <datalist id="s_banks">
                  {BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="s_holder">Tên chủ tài khoản</Label>
                <Input
                  id="s_holder"
                  name="bank_account_holder"
                  placeholder="NGUYEN VAN A — đúng như trên app ngân hàng"
                  defaultValue={supplier?.bank_account_holder ?? ""}
                  className="uppercase"
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="s_products">Mặt hàng cung cấp</Label>
            <Input id="s_products" name="products" placeholder="MacBook, iPhone, loa JBL, sửa màn hình…" defaultValue={supplier?.products ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s_notes">Ghi chú</Label>
            <Textarea id="s_notes" name="notes" rows={2} placeholder="Chính sách bảo hành, công nợ, giờ làm việc…" defaultValue={supplier?.notes ?? ""} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
            Đang hợp tác
            <span className="text-muted-foreground">(bỏ tick để ẩn nhà cung cấp cũ, không cần xoá)</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
