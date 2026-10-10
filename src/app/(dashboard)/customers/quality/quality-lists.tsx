"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { mergeCustomers } from "@/lib/actions/customers";
import { cn } from "@/lib/utils";
import { CustomerDialog } from "../customer-dialog";

export type QualityCustomer = {
  id: string;
  name: string;
  customer_type: "company" | "individual";
  phone: string | null;
  email: string | null;
  tax_code: string | null;
  address: string | null;
  contact_name: string | null;
  wants_vat: boolean;
  invoice_email: string | null;
  notes: string | null;
  deposit_percentage: number;
  representative_name: string | null;
  representative_title: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  budget_unit_code: string | null;
  created_at: string;
  order_count: number;
  last_order_at: string | null;
};

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" });
const TYPE = { company: "Công ty", individual: "Cá nhân" } as const;

function Row({ c, canViewIdNumber, extra }: { c: QualityCustomer; canViewIdNumber: boolean; extra?: React.ReactNode }) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">
          {c.name}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {TYPE[c.customer_type]}
          {c.contact_name ? ` · ${c.contact_name}` : ""}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{c.phone || "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{c.tax_code || "—"}</td>
      <td className="max-w-48 px-3 py-2 break-all">{c.invoice_email || c.email || "—"}</td>
      <td className="max-w-56 px-3 py-2">
        <span className="line-clamp-2">{c.address || "—"}</span>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {c.order_count}
        {c.last_order_at && (
          <span className="block text-xs text-muted-foreground">{dateFmt.format(new Date(c.last_order_at))}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {extra}
          <CustomerDialog
            customer={{ ...c, wants_vat: c.wants_vat ?? false }}
            canViewIdNumber={canViewIdNumber}
          />
        </div>
      </td>
    </tr>
  );
}

const Head = () => (
  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
    <tr>
      <th className="px-3 py-2">Khách</th>
      <th className="px-3 py-2">SĐT</th>
      <th className="px-3 py-2">MST / CCCD</th>
      <th className="px-3 py-2">Email nhận HĐ</th>
      <th className="px-3 py-2">Địa chỉ</th>
      <th className="px-3 py-2 text-right">Đơn · gần nhất</th>
      <th className="px-3 py-2" />
    </tr>
  </thead>
);

export function QualityList({ rows, canViewIdNumber }: { rows: QualityCustomer[]; canViewIdNumber: boolean }) {
  if (!rows.length)
    return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Không còn khách nào. </p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <Head />
        <tbody className="divide-y">
          {rows.map((c) => (
            <Row key={c.id} c={c} canViewIdNumber={canViewIdNumber} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DuplicateGroups({
  groups,
  keyLabel,
  canMerge,
  canViewIdNumber,
}: {
  groups: { key: string; customers: QualityCustomer[] }[];
  keyLabel: string;
  canMerge: boolean;
  canViewIdNumber: boolean;
}) {
  if (!groups.length)
    return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Không còn khách trùng.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <DuplicateGroup key={g.key} group={g} keyLabel={keyLabel} canMerge={canMerge} canViewIdNumber={canViewIdNumber} />
      ))}
    </div>
  );
}

function DuplicateGroup({
  group,
  keyLabel,
  canMerge,
  canViewIdNumber,
}: {
  group: { key: string; customers: QualityCustomer[] };
  keyLabel: string;
  canMerge: boolean;
  canViewIdNumber: boolean;
}) {
  // Mặc định giữ khách có đơn gần nhất (RPC đã xếp lên đầu).
  const [keepId, setKeepId] = useState(group.customers[0]?.id);
  const keep = group.customers.find((c) => c.id === keepId);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <p className="border-b px-3 py-2 text-sm">
        {keyLabel} <b className="tabular-nums">{group.key}</b> · {group.customers.length} khách
        {canMerge && <span className="text-xs text-muted-foreground"> — chọn khách giữ lại, các khách khác bấm Gộp</span>}
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {group.customers.map((c) => (
            <Row
              key={c.id}
              c={c}
              canViewIdNumber={canViewIdNumber}
              extra={
                canMerge ? (
                  c.id === keepId ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      Giữ lại
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setKeepId(c.id)}
                        className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                      >
                        Giữ khách này
                      </button>
                      {keep && <MergeButton keep={keep} drop={c} />}
                    </>
                  )
                ) : null
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MergeButton({ keep, drop }: { keep: QualityCustomer; drop: QualityCustomer }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const merge = () =>
    startTransition(async () => {
      const res = await mergeCustomers(keep.id, drop.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const moved = Object.values(res.moved).reduce((s, n) => s + n, 0);
      toast.success(`Đã gộp "${res.droppedName}" vào "${keep.name}" — chuyển ${moved} bản ghi (đơn, ghi chú…).`);
      setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Merge className="size-4" />
            Gộp
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gộp khách trùng</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            Gộp <b>{drop.name}</b> ({drop.order_count} đơn) vào <b>{keep.name}</b> ({keep.order_count} đơn).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Mọi đơn, ghi chú công nợ, đơn cũ chuyển sang &quot;{keep.name}&quot;.</li>
            <li>Ô còn trống của khách giữ lại (SĐT, MST, địa chỉ, email…) lấy từ khách bị gộp.</li>
            <li>
              Khách &quot;{drop.name}&quot; bị xoá — bản sao còn trong Nhật ký hoạt động. <b>Không hoàn tác được.</b>
            </li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Đóng
          </Button>
          <Button onClick={merge} disabled={pending} className={cn(pending && "opacity-70")}>
            {pending ? "Đang gộp..." : "Gộp vào khách giữ lại"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
