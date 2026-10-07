"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, PackageCheck, Trash2, Truck, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductSearchPicker } from "@/components/product-search-picker";
import { cn } from "@/lib/utils";
import {
  addPurchaseLine,
  addSupplierPayment,
  deletePurchaseLine,
  deletePurchaseOrder,
  deleteSupplierPayment,
  receivePurchaseOrder,
  setPurchaseStatus,
  updatePurchaseHeader,
  updatePurchaseLine,
} from "@/lib/actions/purchases";
import { PAYMENT_METHOD, paymentState, vnd, type PurchaseStatus } from "../purchase-labels";

export type PickType = {
  key: string;
  label: string;
  tracking: "individual" | "quantity";
  units: { id: string; name: string }[];
};
export type EditorLine = {
  id: string;
  typeId: string;
  typeName: string;
  tracking: "individual" | "quantity";
  unitId: string | null;
  units: { id: string; name: string }[];
  quantity: number;
  unitCost: number;
  serials: string[];
  warranty: string | null;
  note: string;
};
type Payment = { id: string; amount: number; paid_on: string; method: string; note: string | null };

const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const fmt = (n: number) => (n ? new Intl.NumberFormat("vi-VN").format(n) : "");
// Serial dán từ Excel / máy quét: mỗi dòng 1 serial (chấp nhận cả dấu phẩy, chấm phẩy, tab).
const splitSerials = (s: string) =>
  s
    .split(/[\n,;\t]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function PurchaseEditor({
  po,
  supplier,
  lines,
  types,
  payments,
  suppliers,
  branches,
  lockBranch,
  canDelete,
  today,
  received,
}: {
  po: {
    id: string;
    code: string;
    status: PurchaseStatus;
    supplierId: string;
    branchId: string;
    orderDate: string;
    invoiceNo: string;
    note: string;
  };
  supplier: {
    name: string;
    phone: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    bank_account_holder: string | null;
  } | null;
  lines: EditorLine[];
  types: PickType[];
  payments: Payment[];
  suppliers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  lockBranch: boolean;
  canDelete: boolean;
  today: string;
  received: { id: string; identifier_code: string; equipment_type_id: string }[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  // Xác nhận 2 lần bấm thay cho window.confirm (trình duyệt có thể chặn ngầm).
  const [armed, setArmed] = useState<string | null>(null);
  const twoStep = (key: string, action: () => void) => {
    if (armed === key) {
      setArmed(null);
      action();
      return;
    }
    setArmed(key);
    setTimeout(() => setArmed((a) => (a === key ? null : a)), 4000);
  };
  const editable = po.status === "draft" || po.status === "ordered";
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(total - paid, 0);
  const ps = paymentState(total, paid);
  const serialIssues = lines.filter((l) => l.tracking === "individual" && l.serials.length !== l.quantity);
  const variantIssues = lines.filter((l) => l.tracking === "quantity" && !l.unitId);

  function run(fn: () => Promise<{ error: string } | { success: true } | undefined>, ok?: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (r && "error" in r) {
        toast.error(r.error);
        return;
      }
      if (ok) toast.success(ok);
      after?.();
      router.refresh();
    });
  }

  const bank = [supplier?.bank_account_number, supplier?.bank_name, supplier?.bank_account_holder].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-5">
        {/* Thông tin phiếu */}
        <HeaderCard po={po} editable={editable} suppliers={suppliers} branches={branches} lockBranch={lockBranch} run={run} />

        {/* Dòng hàng */}
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Hàng mua ({lines.length})</h2>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {lines.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dòng hàng — gõ tên mã hàng ở ô bên dưới để thêm.</p>}
          <div className="space-y-3">
            {lines.map((l) => (
              <LineRow key={l.id} line={l} editable={editable} run={run} armed={armed} twoStep={twoStep} />
            ))}
          </div>
          {editable && (
            <ProductSearchPicker
              options={types}
              placeholder="Thêm hàng: gõ tên mã hàng (vd: MacBook Air M4)…"
              onPick={async (t) => {
                const r = await addPurchaseLine(po.id, {
                  typeId: t.key,
                  unitId: t.units.length === 1 ? t.units[0].id : null,
                  quantity: 1,
                  unitCost: 0,
                });
                if (!("error" in r)) router.refresh();
                return r;
              }}
            />
          )}
          {editable && types.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Chưa có mã hàng thì tạo ở trang Thiết bị trước. Hàng serial: dán danh sách serial (mỗi dòng 1 máy) — có thể điền
              lúc nhận hàng.
            </p>
          )}
          <div className="flex justify-end border-t pt-3 text-sm">
            <span>
              Tổng tiền hàng: <b className="text-base tabular-nums">{vnd(total)}</b>
            </span>
          </div>
        </section>

        {/* Máy đã tạo khi nhập kho */}
        {po.status === "received" && received.length > 0 && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <PackageCheck className="size-4" /> Máy đã nhập kho từ phiếu này ({received.length})
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {received.map((m) => (
                <Link
                  key={m.id}
                  href={`/equipment/${m.equipment_type_id}`}
                  className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium tabular-nums hover:border-primary"
                >
                  {m.identifier_code}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Cột phải: trạng thái + trả tiền */}
      <div className="space-y-5">
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">Xử lý phiếu</h2>
          {editable && (
            <>
              {(serialIssues.length > 0 || variantIssues.length > 0) && lines.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {serialIssues.map((l) => (
                    <li key={l.id}>
                      {l.typeName}: cần {l.quantity} serial, mới có {l.serials.length}
                    </li>
                  ))}
                  {variantIssues.map((l) => (
                    <li key={l.id}>{l.typeName}: chưa chọn biến thể</li>
                  ))}
                </ul>
              )}
              <Button
                className="w-full"
                disabled={busy || lines.length === 0 || serialIssues.length > 0 || variantIssues.length > 0}
                onClick={() => twoStep("receive", () => run(() => receivePurchaseOrder(po.id), "Đã nhập kho."))}
              >
                <PackageCheck className="size-4" />
                {armed === "receive" ? "Bấm lần nữa để nhập kho" : "Nhận hàng & nhập kho"}
              </Button>
              {armed === "receive" && (
                <p className="text-xs text-muted-foreground">
                  Máy serial sẽ được tạo, hàng số lượng cộng tồn. Sau đó dòng hàng bị khoá.
                </p>
              )}
              {po.status === "draft" ? (
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => setPurchaseStatus(po.id, "ordered"), "Đã chuyển sang Đã đặt.")}>
                  <Truck className="size-4" /> Đã đặt hàng — chờ giao
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => setPurchaseStatus(po.id, "draft"))}>
                  <Undo2 className="size-4" /> Về nháp
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full text-destructive"
                disabled={busy}
                onClick={() => twoStep("cancel", () => run(() => setPurchaseStatus(po.id, "cancelled"), "Đã huỷ phiếu."))}
              >
                <XCircle className="size-4" /> {armed === "cancel" ? "Bấm lần nữa để huỷ" : "Huỷ phiếu"}
              </Button>
            </>
          )}
          {po.status === "received" && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Đã nhập kho — dòng hàng đã khoá, vẫn ghi trả tiền và sửa số hoá đơn được.
            </p>
          )}
          {po.status === "cancelled" && <p className="text-sm text-muted-foreground">Phiếu đã huỷ.</p>}
          {canDelete && po.status !== "received" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={busy}
              onClick={() =>
                twoStep("delete", () => run(() => deletePurchaseOrder(po.id), "Đã xoá phiếu.", () => router.push("/purchases")))
              }
            >
              <Trash2 className="size-4" /> {armed === "delete" ? "Bấm lần nữa để xoá hẳn" : "Xoá phiếu"}
            </Button>
          )}
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Trả tiền NCC</h2>
            <span className={cn("text-xs font-semibold", ps.className)}>{ps.label}</span>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Tổng tiền</dt>
            <dd className="text-right tabular-nums">{vnd(total)}</dd>
            <dt className="text-muted-foreground">Đã trả</dt>
            <dd className="text-right tabular-nums">{vnd(paid)}</dd>
            <dt className="font-semibold">Còn nợ</dt>
            <dd className="text-right font-semibold tabular-nums">{vnd(remaining)}</dd>
          </dl>
          {bank && (
            <div className="flex items-start gap-1 rounded-lg bg-muted/60 p-2 text-xs">
              <div className="flex-1">
                <p className="font-medium tabular-nums">{supplier?.bank_account_number}</p>
                <p className="text-muted-foreground">{[supplier?.bank_name, supplier?.bank_account_holder].filter(Boolean).join(" · ")}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${bank}${remaining ? ` · ${remaining}` : ""} · ${po.code}`)
                    .then(() => toast.success("Đã copy thông tin chuyển khoản."))
                }
              >
                <Copy className="size-4" />
              </Button>
            </div>
          )}
          {payments.length > 0 && (
            <ul className="divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1">
                    <p className="font-medium tabular-nums">{vnd(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.paid_on.split("-").reverse().join("/")} · {PAYMENT_METHOD[p.method as keyof typeof PAYMENT_METHOD] ?? p.method}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => twoStep("pay-" + p.id, () => run(() => deleteSupplierPayment(p.id), "Đã xoá khoản trả."))}
                      title={armed === "pay-" + p.id ? "Bấm lần nữa để xoá" : "Xoá khoản trả"}
                    >
                      <Trash2 className={cn("size-4", armed === "pay-" + p.id && "text-destructive")} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {po.status !== "cancelled" && <PaymentForm poId={po.id} remaining={remaining} today={today} run={run} busy={busy} />}
        </section>
      </div>
    </div>
  );
}

type RunFn = (fn: () => Promise<{ error: string } | { success: true } | undefined>, ok?: string, after?: () => void) => void;

function HeaderCard({
  po,
  editable,
  suppliers,
  branches,
  lockBranch,
  run,
}: {
  po: { id: string; supplierId: string; branchId: string; orderDate: string; invoiceNo: string; note: string };
  editable: boolean;
  suppliers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  lockBranch: boolean;
  run: RunFn;
}) {
  const [supplierId, setSupplierId] = useState(po.supplierId);
  const [branchId, setBranchId] = useState(po.branchId);
  const [date, setDate] = useState(po.orderDate);
  const [invoice, setInvoice] = useState(po.invoiceNo);
  const [note, setNote] = useState(po.note);
  const dirty =
    supplierId !== po.supplierId || branchId !== po.branchId || date !== po.orderDate || invoice !== po.invoiceNo || note !== po.note;
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-70";
  return (
    <section className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Nhà cung cấp</Label>
        <select className={sel} value={supplierId} disabled={!editable} onChange={(e) => setSupplierId(e.target.value)}>
          {!suppliers.some((s) => s.id === supplierId) && <option value={supplierId}>(NCC đã ngừng hợp tác)</option>}
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Kho nhận</Label>
          <select className={sel} value={branchId} disabled={!editable || lockBranch} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Ngày mua</Label>
          <Input type="date" className="h-9" value={date} disabled={!editable} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Số hoá đơn / chứng từ NCC</Label>
        <Input className="h-9" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Điền khi có hoá đơn" />
      </div>
      <div className="space-y-1.5">
        <Label>Ghi chú</Label>
        <Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {dirty && (
        <div className="sm:col-span-2">
          <Button
            size="sm"
            onClick={() =>
              run(
                () =>
                  updatePurchaseHeader(po.id, {
                    supplierId,
                    branchId,
                    orderDate: date,
                    supplierInvoiceNo: invoice,
                    note,
                  }),
                "Đã lưu thông tin phiếu.",
              )
            }
          >
            Lưu thông tin phiếu
          </Button>
        </div>
      )}
    </section>
  );
}

function LineRow({
  line,
  editable,
  run,
  armed,
  twoStep,
}: {
  line: EditorLine;
  editable: boolean;
  run: RunFn;
  armed: string | null;
  twoStep: (key: string, action: () => void) => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [cost, setCost] = useState(fmt(line.unitCost));
  const [serials, setSerials] = useState(line.serials.join("\n"));
  const serialList = splitSerials(serials);
  const save = (patch: Parameters<typeof updatePurchaseLine>[1]) => run(() => updatePurchaseLine(line.id, patch));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <p className="font-medium">{line.typeName}</p>
          <p className="text-xs text-muted-foreground">{line.tracking === "individual" ? "Theo serial" : "Theo số lượng"}</p>
        </div>
        {line.units.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Biến thể</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-70"
              value={line.unitId ?? ""}
              disabled={!editable}
              onChange={(e) => save({ unitId: e.target.value || null })}
            >
              <option value="">{line.tracking === "quantity" ? "— chọn —" : "(không chọn)"}</option>
              {line.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="w-20 space-y-1">
          <Label className="text-xs">Số lượng</Label>
          <Input
            className="h-9 tabular-nums"
            inputMode="numeric"
            value={qty}
            disabled={!editable}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            onBlur={() => Number(qty) !== line.quantity && Number(qty) > 0 && save({ quantity: Number(qty) })}
          />
        </div>
        <div className="w-36 space-y-1">
          <Label className="text-xs">Đơn giá (đ)</Label>
          <Input
            className="h-9 tabular-nums"
            inputMode="numeric"
            value={cost}
            disabled={!editable}
            onChange={(e) => setCost(fmt(num(e.target.value)))}
            onBlur={() => num(cost) !== line.unitCost && save({ unitCost: num(cost) })}
          />
        </div>
        <div className="w-32 text-right">
          <p className="text-xs text-muted-foreground">Thành tiền</p>
          <p className="h-9 pt-1.5 font-semibold tabular-nums">{vnd(line.quantity * line.unitCost)}</p>
        </div>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(armed === "line-" + line.id && "text-destructive")}
            onClick={() => twoStep("line-" + line.id, () => run(() => deletePurchaseLine(line.id)))}
          >
            <Trash2 className="size-4" />
            {armed === "line-" + line.id && "Xoá?"}
          </Button>
        )}
      </div>
      {line.tracking === "individual" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <div className="space-y-1">
            <Label className="text-xs">
              Serial ({serialList.length}/{line.quantity}) — mỗi dòng 1 máy
            </Label>
            <Textarea
              rows={Math.min(Math.max(line.quantity, 2), 8)}
              value={serials}
              disabled={!editable}
              onChange={(e) => setSerials(e.target.value)}
              onBlur={() => serialList.join("\n") !== line.serials.join("\n") && save({ serials: serialList })}
              placeholder="Quét hoặc dán serial…"
              className={cn("font-mono text-sm", serialList.length !== line.quantity && editable && "border-amber-400")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hết hạn bảo hành</Label>
            <Input
              type="date"
              className="h-9"
              defaultValue={line.warranty ?? ""}
              disabled={!editable}
              onBlur={(e) => (e.target.value || null) !== line.warranty && save({ warrantyExpiresOn: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentForm({
  poId,
  remaining,
  today,
  run,
  busy,
}: {
  poId: string;
  remaining: number;
  today: string;
  run: RunFn;
  busy: boolean;
}) {
  const [amount, setAmount] = useState(fmt(remaining));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<"chuyen_khoan" | "tien_mat" | "khac">("chuyen_khoan");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Ghi khoản trả</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-9 tabular-nums" inputMode="numeric" value={amount} onChange={(e) => setAmount(fmt(num(e.target.value)))} placeholder="Số tiền" />
        <Input className="h-9" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          {Object.entries(PAYMENT_METHOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú" />
      </div>
      <Button
        size="sm"
        className="w-full"
        disabled={busy || num(amount) <= 0}
        onClick={() =>
          run(
            () => addSupplierPayment({ poId, amount: num(amount), paidOn: date, method, note }),
            "Đã ghi khoản trả.",
            () => {
              setAmount("");
              setNote("");
            },
          )
        }
      >
        Ghi trả {num(amount) ? vnd(num(amount)) : ""}
      </Button>
    </div>
  );
}
