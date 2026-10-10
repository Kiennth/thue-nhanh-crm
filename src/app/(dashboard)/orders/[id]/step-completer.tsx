"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { completeOrderSteps } from "@/lib/actions/orders";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS, TASK_TYPE_LABELS } from "@/lib/order-labels";
import type { PaymentMethod, TaskType } from "@/types/database";
import { cn } from "@/lib/utils";

// Hoàn thành khâu gọn (Grok tách gọn CRM 10/10, giai đoạn 3): người làm mặc
// định = người đang đăng nhập (đổi được), thu tiền ngay (tuỳ chọn), cảnh báo
// "còn nợ / chưa thu cọc" khi Nghiệm thu / Nhập kho → nhập lý do mới tiếp tục
// (không chặn). Dùng cho 1 khâu (ngay trên dòng) và cả nhóm khâu (hộp thoại).

export type StepEmployee = { id: string; name: string };
export type StepDef = {
  taskType: TaskType;
  employees: StepEmployee[];
  // priorityCount người đầu = nhân sự kho phụ trách khâu (nhóm riêng).
  priorityCount?: number;
  priorityLabel?: string;
  // Người đã được phân công sẵn khâu này — ưu tiên hơn người đang đăng nhập.
  assignedId?: string | null;
};
export type StepChecks = { remaining: number; depositDue: number; missingCccd: boolean; hasOwingOverride: boolean };

// Cảnh báo nợ/cọc khi Nghiệm thu / Nhập kho bỏ từ 2026-10-11 (luồng 3 bước):
// khâu chỉ để tính lương, đơn hoàn tất ở bước "Nhận lại máy", nợ/cọc xem ở
// Công nợ. Để rỗng → hộp tick khâu không còn đòi lý do.
const OWING_STEPS: TaskType[] = [];
const REASON_PRESETS = ["Công nợ công ty 30 ngày", "KH hẹn chuyển khoản", "Đã trừ cọc đơn khác", "Miễn cọc theo hồ sơ"];
const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

export function StepCompleterBody({
  orderId,
  steps,
  currentEmployeeId,
  checks,
  paymentDefault,
  submitLabel,
  compact,
  onDone,
}: {
  orderId: string;
  steps: StepDef[];
  currentEmployeeId: string | null;
  checks: StepChecks;
  // Gợi ý thu tiền: khâu Ký HĐ thu cọc, khâu Nghiệm thu thu phần còn nợ.
  paymentDefault: { type: "invoice" | "deposit_collect"; amount: number } | null;
  submitLabel: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const multi = steps.length > 1;
  const defaultEmp = (s: StepDef) =>
    s.assignedId && s.employees.some((e) => e.id === s.assignedId)
      ? s.assignedId
      : currentEmployeeId && s.employees.some((e) => e.id === currentEmployeeId)
        ? currentEmployeeId
        : "";
  const [sameForAll, setSameForAll] = useState(true);
  const [assignees, setAssignees] = useState<Record<string, string>>(() =>
    Object.fromEntries(steps.map((s) => [s.taskType, defaultEmp(s)])),
  );
  const [note, setNote] = useState("");
  const [payOn, setPayOn] = useState(false);
  const [payType, setPayType] = useState<"invoice" | "deposit_collect">(paymentDefault?.type ?? "invoice");
  const [payAmount, setPayAmount] = useState(String(Math.round(paymentDefault?.amount ?? 0) || ""));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("chuyen_khoan");
  const [reason, setReason] = useState("");
  const [serverIssues, setServerIssues] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cảnh báo tính trước ở trình duyệt (server tính lại khi bấm).
  const amount = payOn ? Number(payAmount) || 0 : 0;
  const owingStep = steps.some((s) => OWING_STEPS.includes(s.taskType)) && !checks.hasOwingOverride;
  const remainingAfter = Math.max(0, checks.remaining - (payType === "invoice" ? amount : 0));
  const depositAfter = Math.max(0, checks.depositDue - (payType === "deposit_collect" ? amount : 0));
  const localIssues = owingStep
    ? [
        ...(remainingAfter >= 1000 ? [`Khách còn nợ ${vnd(remainingAfter)}`] : []),
        ...(depositAfter >= 1000 ? [`Cọc ${vnd(depositAfter)} chưa thu`] : []),
      ]
    : [];
  const issues = serverIssues ?? localIssues;
  const needReason = issues.length > 0;
  const showCccd = checks.missingCccd && steps.some((s) => s.taskType === "ky_hop_dong_thu_coc");
  const empOf = (s: StepDef) => (multi && sameForAll ? assignees[steps[0].taskType] : assignees[s.taskType]);
  const missingEmp = steps.some((s) => !empOf(s));

  function submit() {
    setError(null);
    if (missingEmp) return setError("Chọn người làm (để tính khoán).");
    if (needReason && reason.trim().length < 3) return setError("Nhập lý do để tiếp tục.");
    startTransition(async () => {
      const res = await completeOrderSteps({
        orderId,
        steps: steps.map((s) => ({ taskType: s.taskType, employeeId: empOf(s) })),
        note: note.trim() || undefined,
        payment: payOn && amount > 0 ? { amount, method: payMethod, type: payType } : undefined,
        reason: reason.trim() || undefined,
      });
      if ("needReason" in res) {
        setServerIssues(res.needReason);
        setError("Nhập lý do để tiếp tục.");
        return;
      }
      if ("error" in res) return setError(res.error);
      for (const w of res.warnings) toast.info(w);
      toast.success(`Đã hoàn thành: ${steps.map((s) => TASK_TYPE_LABELS[s.taskType]).join(" + ")}`);
      onDone?.();
    });
  }

  const option = (e: StepEmployee) => (
    <option key={e.id} value={e.id}>
      {e.id === currentEmployeeId ? `${e.name} (bạn)` : e.name}
    </option>
  );
  const select = (s: StepDef, value: string, onChange: (v: string) => void, label: string) => {
    const n = s.priorityCount ?? 0;
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="">— Người làm —</option>
        {n > 0 && n < s.employees.length ? (
          <>
            <optgroup label={s.priorityLabel ?? "Kho phụ trách"}>{s.employees.slice(0, n).map(option)}</optgroup>
            <optgroup label="Kho khác">{s.employees.slice(n).map(option)}</optgroup>
          </>
        ) : (
          s.employees.map(option)
        )}
      </select>
    );
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {multi && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sameForAll} onChange={(e) => setSameForAll(e.target.checked)} />
          Cùng 1 người làm cả {steps.length} khâu
        </label>
      )}
      <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
        {(multi && sameForAll ? [steps[0]] : steps).map((s) => (
          <div key={s.taskType} className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {multi && sameForAll ? steps.map((x) => TASK_TYPE_LABELS[x.taskType]).join(" + ") : TASK_TYPE_LABELS[s.taskType]} ·
              người làm (tính khoán)
            </p>
            {select(
              s,
              assignees[s.taskType] ?? "",
              (v) => setAssignees((a) => ({ ...a, [s.taskType]: v })),
              `Người làm ${TASK_TYPE_LABELS[s.taskType]}`,
            )}
          </div>
        ))}
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" className="h-9" />

      {paymentDefault !== null && (
        <div className="space-y-2 rounded-md border p-2.5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={payOn} onChange={(e) => setPayOn(e.target.checked)} />
            Thu tiền ngay
            {!payOn && paymentDefault.amount > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                (gợi ý {vnd(paymentDefault.amount)} {paymentDefault.type === "deposit_collect" ? "tiền cọc" : "còn nợ"})
              </span>
            )}
          </label>
          {payOn && (
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={payType}
                onChange={(e) => setPayType(e.target.value as "invoice" | "deposit_collect")}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label="Loại khoản thu"
              >
                <option value="invoice">Tiền thuê (hoá đơn)</option>
                <option value="deposit_collect">Tiền cọc</option>
              </select>
              <Input
                type="number"
                min={0}
                step={1000}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-9"
                aria-label="Số tiền thu"
              />
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label="Phương thức"
              >
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m as PaymentMethod]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {showCccd && (
        <p className="flex items-start gap-1.5 rounded-md bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 size-3.5 shrink-0" /> Khách cá nhân chưa có CCCD — chỉ nhắc, vẫn ký được.
        </p>
      )}

      {needReason && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" /> Cảnh báo — không chặn
          </p>
          <ul className="list-disc pl-5 text-xs">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="text-xs">Nhập lý do để tiếp tục — lý do lưu vào đơn và hiện ở trang Hôm nay của quản lý.</p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Lý do *"
            className="h-9 bg-background"
            aria-label="Lý do"
          />
          <div className="flex flex-wrap gap-1.5">
            {REASON_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-full border border-amber-300 bg-background px-2.5 py-0.5 text-xs hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={submit} disabled={pending} className={cn(!compact && "w-full sm:w-auto")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {needReason ? "Xác nhận có lý do" : submitLabel}
      </Button>
    </div>
  );
}

// 1 khâu, ngay trên dòng khâu đang tới lượt.
export function StepCompleterInline(props: {
  orderId: string;
  label: string;
  step: StepDef;
  currentEmployeeId: string | null;
  checks: StepChecks;
  paymentDefault: { type: "invoice" | "deposit_collect"; amount: number } | null;
}) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.03] p-3 shadow-sm">
      <p className="mb-2 text-sm font-medium">{props.label}</p>
      <StepCompleterBody
        orderId={props.orderId}
        steps={[props.step]}
        currentEmployeeId={props.currentEmployeeId}
        checks={props.checks}
        paymentDefault={props.paymentDefault}
        submitLabel="Hoàn thành"
        compact
      />
    </div>
  );
}

// Nhóm thao tác (vd "Giao xong" = Chuẩn bị + Giao hàng) — nút ở đầu thẻ khâu.
export function StepGroupButton({
  orderId,
  label,
  steps,
  currentEmployeeId,
  checks,
  paymentDefault,
}: {
  orderId: string;
  label: string;
  steps: StepDef[];
  currentEmployeeId: string | null;
  checks: StepChecks;
  paymentDefault: { type: "invoice" | "deposit_collect"; amount: number } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="mt-2 w-full">
            <Check className="size-4" />
            {label}
            <span className="text-xs font-normal opacity-80">
              ({steps.map((s) => TASK_TYPE_LABELS[s.taskType]).join(" + ")})
            </span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Hoàn thành {steps.length} khâu một lần — mỗi khâu vẫn ghi người làm riêng, khoán tính như cũ.
        </p>
        <StepCompleterBody
          orderId={orderId}
          steps={steps}
          currentEmployeeId={currentEmployeeId}
          checks={checks}
          paymentDefault={paymentDefault}
          submitLabel={label}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
