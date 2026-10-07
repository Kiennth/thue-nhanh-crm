"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Copy, History, ListChecks, Loader2, PackageCheck, Trash2, Truck, Undo2, XCircle } from "lucide-react";
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
  listBackfillMachines,
  receivePurchaseOrder,
  setPurchaseStatus,
  renameReceivedMachine,
  updatePurchaseHeader,
  updatePurchaseLine,
  updateReceivedLineCost,
  updateReceivedLineWarranty,
} from "@/lib/actions/purchases";
import { PAYMENT_METHOD, paymentState, vnd, type PurchaseKind, type PurchaseStatus } from "../purchase-labels";

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
    kind: PurchaseKind;
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
  const backfill = po.kind === "backfill";
  // Sửa phiếu đã nhập kho (CEO 2026-10-07, gõ nhầm giá thừa số 0): quản lý sửa
  // được NCC, ngày mua, đơn giá, serial, bảo hành — không đổi số lượng/kho.
  const fixable = po.status === "received" && canDelete;
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
        <HeaderCard po={po} editable={editable} fixable={fixable} suppliers={suppliers} branches={branches} lockBranch={lockBranch} run={run} />

        {/* Dòng hàng */}
        <section
          className={cn(
            "space-y-3 rounded-xl border p-4",
            backfill ? "border-violet-200 dark:border-violet-900/60" : "border-sky-200 dark:border-sky-900/60",
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className={cn("flex items-center gap-2 font-semibold", backfill ? "text-violet-800 dark:text-violet-300" : "text-sky-800 dark:text-sky-300")}>
              {backfill ? <History className="size-4" /> : <PackageCheck className="size-4" />}
              {backfill ? `Máy có sẵn cần gắn NCC (${lines.length} mã)` : `Hàng mua (${lines.length})`}
            </h2>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {lines.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dòng hàng — gõ tên mã hàng ở ô bên dưới để thêm.</p>}
          <div className="space-y-3">
            {lines.map((l) => (
              <LineRow key={l.id} line={l} editable={editable} fixable={fixable} run={run} armed={armed} twoStep={twoStep} backfill={backfill} />
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
              {backfill
                ? "Chọn mã hàng → bấm “Chọn máy có sẵn” để tick máy (hoặc dán danh sách serial) → điền giá mua. Bấm Ghi nhận để gắn NCC, giá và ngày mua cho các máy đó — tồn kho không đổi."
                : "Chưa có mã hàng thì tạo ở trang Thiết bị trước. Hàng serial: dán danh sách serial (mỗi dòng 1 máy) — có thể điền lúc nhận hàng."}
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
              <PackageCheck className="size-4" /> {backfill ? "Máy đã gắn phiếu này" : "Máy đã nhập kho từ phiếu này"} ({received.length})
            </h2>
            {fixable ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Sửa serial từng máy (vd thay serial tạm bằng serial thật) — bấm ra ngoài ô là lưu.</p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {received.map((m) => (
                    <MachineCodeInput key={m.id} machine={m} run={run} />
                  ))}
                </div>
              </>
            ) : (
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
            )}
          </section>
        )}
      </div>

      {/* Cột phải: trạng thái + trả tiền */}
      <div className="space-y-5">
        <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <h2 className="font-semibold text-emerald-900 dark:text-emerald-200">Xử lý phiếu</h2>
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
                className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy || lines.length === 0 || serialIssues.length > 0 || variantIssues.length > 0}
                onClick={() =>
                  twoStep("receive", () => run(() => receivePurchaseOrder(po.id), backfill ? "Đã ghi nhận cho máy có sẵn." : "Đã nhập kho."))
                }
              >
                {backfill ? <History className="size-4" /> : <PackageCheck className="size-4" />}
                {armed === "receive"
                  ? backfill
                    ? "Bấm lần nữa để ghi nhận"
                    : "Bấm lần nữa để nhập kho"
                  : backfill
                    ? "Ghi nhận cho máy có sẵn"
                    : "Nhận hàng & nhập kho"}
              </Button>
              {armed === "receive" && (
                <p className="text-xs text-muted-foreground">
                  {backfill
                    ? "Các máy đã chọn được gắn phiếu này (NCC, giá mua, ngày mua). Tồn kho không đổi. Sau đó dòng hàng bị khoá."
                    : "Máy serial sẽ được tạo, hàng số lượng cộng tồn. Sau đó dòng hàng bị khoá."}
                </p>
              )}
              {po.status === "draft" ? (
                <Button
                  variant="outline"
                  className="w-full border-amber-400 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                  disabled={busy}
                  onClick={() => run(() => setPurchaseStatus(po.id, "ordered"), "Đã chuyển sang Đã đặt.")}
                >
                  <Truck className="size-4" /> Đã đặt hàng — chờ giao
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => setPurchaseStatus(po.id, "draft"))}>
                  <Undo2 className="size-4" /> Về nháp
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                disabled={busy}
                onClick={() => twoStep("cancel", () => run(() => setPurchaseStatus(po.id, "cancelled"), "Đã huỷ phiếu."))}
              >
                <XCircle className="size-4" /> {armed === "cancel" ? "Bấm lần nữa để huỷ" : "Huỷ phiếu"}
              </Button>
            </>
          )}
          {po.status === "received" && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> {backfill ? "Đã ghi nhận" : "Đã nhập kho"} —{" "}
              {fixable
                ? "quản lý vẫn sửa được NCC, ngày mua, đơn giá, serial, bảo hành (không đổi số lượng/kho)."
                : "dòng hàng đã khoá, vẫn ghi trả tiền và sửa số hoá đơn được."}
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

        <section
          className={cn(
            "space-y-3 rounded-xl border p-4",
            remaining > 0
              ? "border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20"
              : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20",
          )}
        >
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
  fixable,
  suppliers,
  branches,
  lockBranch,
  run,
}: {
  po: { id: string; supplierId: string; branchId: string; orderDate: string; invoiceNo: string; note: string };
  editable: boolean;
  fixable: boolean;
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
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900/30">
      <div className="space-y-1.5">
        <Label>Nhà cung cấp</Label>
        <select className={sel} value={supplierId} disabled={!editable && !fixable} onChange={(e) => setSupplierId(e.target.value)}>
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
          <Input type="date" className="h-9" value={date} disabled={!editable && !fixable} onChange={(e) => setDate(e.target.value)} />
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
  fixable,
  run,
  armed,
  twoStep,
  backfill,
}: {
  line: EditorLine;
  editable: boolean;
  fixable: boolean;
  run: RunFn;
  armed: string | null;
  twoStep: (key: string, action: () => void) => void;
  backfill: boolean;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [cost, setCost] = useState(fmt(line.unitCost));
  const [serials, setSerials] = useState(line.serials.join("\n"));
  const serialList = splitSerials(serials);
  const save = (patch: Parameters<typeof updatePurchaseLine>[1]) => run(() => updatePurchaseLine(line.id, patch));

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-l-4 p-3",
        line.tracking === "individual"
          ? "border-l-violet-500 bg-violet-50/30 dark:bg-violet-950/15"
          : "border-l-teal-500 bg-teal-50/30 dark:bg-teal-950/15",
      )}
    >
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
            value={backfill && line.tracking === "individual" ? String(serialList.length || line.quantity) : qty}
            disabled={!editable || (backfill && line.tracking === "individual")}
            title={backfill && line.tracking === "individual" ? "Tự tính theo số máy đã chọn" : undefined}
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
            disabled={!editable && !fixable}
            onChange={(e) => setCost(fmt(num(e.target.value)))}
            onBlur={() => {
              if (num(cost) === line.unitCost) return;
              if (fixable) run(() => updateReceivedLineCost(line.id, num(cost)), "Đã sửa đơn giá — giá mua của máy đã cập nhật.");
              else save({ unitCost: num(cost) });
            }}
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
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">
                {backfill ? `Máy có sẵn (${serialList.length})` : `Serial (${serialList.length}/${line.quantity})`} — mỗi dòng 1 máy
              </Label>
              {backfill && editable && (
                <MachinePicker
                  typeId={line.typeId}
                  selected={serialList}
                  onApply={(codes) => {
                    setSerials(codes.join("\n"));
                    save({ serials: codes });
                  }}
                />
              )}
            </div>
            <Textarea
              rows={Math.min(Math.max(line.quantity, 2), 8)}
              value={serials}
              disabled={!editable}
              onChange={(e) => setSerials(e.target.value)}
              onBlur={() => serialList.join("\n") !== line.serials.join("\n") && save({ serials: serialList })}
              placeholder={backfill ? "Bấm “Chọn máy có sẵn” hoặc dán serial…" : "Quét hoặc dán serial…"}
              className={cn("font-mono text-sm", !backfill && serialList.length !== line.quantity && editable && "border-amber-400")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hết hạn bảo hành</Label>
            <Input
              type="date"
              className="h-9"
              defaultValue={line.warranty ?? ""}
              disabled={!editable && !fixable}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v === line.warranty) return;
                if (fixable) run(() => updateReceivedLineWarranty(line.id, v), "Đã sửa bảo hành.");
                else save({ warrantyExpiresOn: v });
              }}
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

// Chọn máy serial có sẵn của 1 mã hàng (phiếu "Ghi lại hàng đã có"). Mặc định
// ẩn máy đã gắn phiếu khác; tick → Áp dụng điền vào ô serial.
function MachinePicker({
  typeId,
  selected,
  onApply,
}: {
  typeId: string;
  selected: string[];
  onApply: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [machines, setMachines] = useState<
    | {
        code: string;
        unitName: string | null;
        branchName: string | null;
        status: string;
        purchaseDate: string | null;
        purchasePrice: number | null;
        poCode: string | null;
      }[]
    | null
  >(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [showLinked, setShowLinked] = useState(false);

  function openPicker() {
    setOpen(true);
    setPicked(new Set(selected));
    if (machines) return;
    startLoad(async () => {
      const r = await listBackfillMachines(typeId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setMachines(r.machines);
    });
  }

  const needle = q.trim().toLowerCase();
  const visible = (machines ?? []).filter(
    (m) =>
      (showLinked || !m.poCode || picked.has(m.code)) &&
      (!needle || [m.code, m.unitName, m.branchName].join(" ").toLowerCase().includes(needle)),
  );
  const linkedCount = (machines ?? []).filter((m) => m.poCode).length;

  if (!open)
    return (
      <Button
        type="button"
        size="sm"
        className="h-7 bg-violet-600 text-white hover:bg-violet-700"
        onClick={openPicker}
      >
        <ListChecks className="size-4" /> Chọn máy có sẵn
      </Button>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2 border-b p-4">
          <h3 className="font-semibold">Chọn máy có sẵn</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 flex-1" placeholder="Lọc serial, biến thể, kho…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPicked(new Set([...picked, ...visible.filter((m) => !m.poCode).map((m) => m.code)]))}
            >
              Chọn tất cả đang hiện
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              Bỏ chọn
            </Button>
          </div>
          {linkedCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showLinked} onChange={(e) => setShowLinked(e.target.checked)} />
              Hiện cả {linkedCount} máy đã gắn phiếu khác (không chọn được)
            </label>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading || !machines ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tải máy…
            </p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Không có máy nào khớp.</p>
          ) : (
            visible.map((m) => {
              const on = picked.has(m.code);
              const locked = !!m.poCode && !on;
              return (
                <label
                  key={m.code}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                    on ? "bg-violet-100 dark:bg-violet-950/50" : "hover:bg-muted",
                    locked && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => {
                      const next = new Set(picked);
                      if (on) next.delete(m.code);
                      else next.add(m.code);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-36 font-mono font-medium">{m.code}</span>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {[m.unitName, m.branchName, m.status === "disposed" ? "đã thanh lý" : m.status === "rented" ? "đang thuê" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {m.poCode
                      ? `phiếu ${m.poCode}`
                      : m.purchasePrice
                        ? `đã có giá ${vnd(m.purchasePrice)}`
                        : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3">
          <span className="text-sm">
            Đã chọn <b>{picked.size}</b> máy
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button
              type="button"
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                onApply([...picked].sort());
                setOpen(false);
              }}
            >
              Áp dụng {picked.size} máy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MachineCodeInput({
  machine,
  run,
}: {
  machine: { id: string; identifier_code: string; equipment_type_id: string };
  run: RunFn;
}) {
  const [code, setCode] = useState(machine.identifier_code);
  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 font-mono text-xs"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onBlur={() => {
          const v = code.trim();
          if (!v || v === machine.identifier_code) return setCode(machine.identifier_code);
          run(() => renameReceivedMachine(machine.id, v), `Đã đổi serial thành ${v}.`);
        }}
      />
      <Link href={`/equipment/${machine.equipment_type_id}`} className="shrink-0 text-xs text-muted-foreground hover:text-primary">
        xem
      </Link>
    </div>
  );
}
