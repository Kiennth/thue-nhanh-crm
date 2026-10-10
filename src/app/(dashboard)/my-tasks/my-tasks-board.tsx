"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Hand, Loader2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TASK_TYPE_LABELS } from "@/lib/order-labels";
import { claimOrderStep, getStepChecksForOrder } from "@/lib/actions/my-tasks";
import type { TaskType } from "@/types/database";
import { cn } from "@/lib/utils";
import { StepCompleterBody, type StepChecks } from "../orders/[id]/step-completer";

export type BoardTask = {
  order_id: string;
  order_code: string;
  task_type: TaskType;
  due_at: string;
  branch_id: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
};
export type DoneTask = {
  order_id: string;
  order_code: string;
  task_type: TaskType;
  created_at: string;
  customer_name: string | null;
};
type Tab = "mine" | "unclaimed" | "branch" | "done";

const SHORT_BRANCH: Record<string, string> = { "Hà Nội": "HN", "TP HCM": "HCM", "Đà Nẵng": "ĐN" };
const BRANCH_TONE: Record<string, string> = {
  HN: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  HCM: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  ĐN: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};
// Ghi chú cách tính hạn hiện cạnh giờ (giống mockup "giao 14:00 − 2h").
const DUE_RULE: Partial<Record<TaskType, string>> = {
  ky_hop_dong_thu_coc: "giao − 1 ngày",
  chuan_bi: "giao − 2h",
  giao_hang_ban_giao: "giờ giao",
  thu_hoi: "giờ trả",
  nghiem_thu: "trả + 24h",
  nhap_kho_bao_tri: "trả + 48h",
};
const GROUPS = [
  { key: "overdue", label: "Quá hạn" },
  { key: "today", label: "Hôm nay" },
  { key: "tomorrow", label: "Ngày mai" },
  { key: "week", label: "Tuần này" },
  { key: "later", label: "Sau đó" },
] as const;

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const dueFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function MyTasksBoard({
  tasks,
  doneToday,
  now,
  me,
  branches,
  initialTab,
  initialBranch,
}: {
  tasks: BoardTask[];
  doneToday: DoneTask[];
  now: string;
  me: { id: string; name: string };
  branches: { id: string; name: string }[];
  initialTab: Tab;
  initialBranch: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [branch, setBranch] = useState<string | null>(initialBranch);
  const [completing, setCompleting] = useState<BoardTask | null>(null);

  const nowMs = new Date(now).getTime();
  const today = dayKey.format(new Date(now));
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const groupOf = (t: BoardTask) => {
    if (new Date(t.due_at).getTime() < nowMs) return "overdue";
    const k = dayKey.format(new Date(t.due_at));
    return k === today ? "today" : k === tomorrow ? "tomorrow" : k <= weekEnd ? "week" : "later";
  };
  const inBranch = (t: BoardTask) => !branch || t.branch_id === branch;
  const mine = tasks.filter((t) => t.assignee_id === me.id);
  const unclaimed = tasks.filter((t) => !t.assignee_id && inBranch(t));
  const branchAll = tasks.filter(inBranch);
  const shown = tab === "mine" ? mine : tab === "unclaimed" ? unclaimed : branchAll;
  const shortOf = new Map(branches.map((b) => [b.id, SHORT_BRANCH[b.name] ?? b.name]));
  const branchChip = (id: string | null) => {
    const s = id ? shortOf.get(id) : null;
    return s ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", BRANCH_TONE[s])}>{s}</span> : null;
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "mine", label: "Của tôi", count: mine.length },
    { key: "unclaimed", label: "Chưa ai nhận", count: unclaimed.length },
    { key: "branch", label: branch ? `Cả kho ${shortOf.get(branch) ?? ""}` : "Tất cả kho", count: branchAll.length },
    { key: "done", label: "Đã xong hôm nay", count: doneToday.length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                tab === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  tab === t.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        {tab !== "mine" && tab !== "done" && (
          <div className="flex gap-1 sm:ml-auto">
            {[{ id: null as string | null, name: "Tất cả" }, ...branches].map((b) => (
              <button
                key={b.id ?? "all"}
                type="button"
                onClick={() => setBranch(b.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  branch === b.id ? "border-foreground/40 bg-muted" : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {b.id ? (shortOf.get(b.id) ?? b.name) : b.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "done" ? (
        <div className="rounded-xl border bg-card">
          {doneToday.length ? (
            <ul className="divide-y">
              {doneToday.map((d) => (
                <li key={`${d.order_id}-${d.task_type}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Check className="size-4 text-emerald-600" />
                  <Link href={`/orders/${d.order_id}`} className="font-semibold text-primary hover:underline">
                    {d.order_code}
                  </Link>
                  <span>{TASK_TYPE_LABELS[d.task_type]}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.customer_name ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">Hôm nay bạn chưa hoàn thành khâu nào.</p>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {tab === "mine"
            ? "Bạn chưa nhận việc nào — xem tab \"Chưa ai nhận\" để nhận việc của kho."
            : "Không có việc nào."}
        </p>
      ) : (
        GROUPS.map((g) => {
          const rows = shown.filter((t) => groupOf(t) === g.key);
          if (!rows.length) return null;
          return (
            <section key={g.key} className="space-y-1.5">
              <h2
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold",
                  g.key === "overdue" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground",
                )}
              >
                {g.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    g.key === "overdue" ? "bg-rose-600 text-white" : "bg-muted",
                  )}
                >
                  {rows.length}
                </span>
              </h2>
              <div className="overflow-hidden rounded-xl border bg-card">
                <ul className="divide-y">
                  {rows.map((t) => (
                    <TaskRow
                      key={`${t.order_id}-${t.task_type}`}
                      task={t}
                      overdue={g.key === "overdue"}
                      meId={me.id}
                      branchChip={branchChip(t.branch_id)}
                      onComplete={() => setCompleting(t)}
                    />
                  ))}
                </ul>
              </div>
            </section>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        Hạn: Ký HĐ & cọc = giao − 1 ngày · Chuẩn bị = giao − 2h · Giao = giờ giao · Thu hồi = giờ trả · Nghiệm thu = trả +
        24h · Nhập kho = trả + 48h. Chuông báo trước 1 giờ và khi quá hạn (quá hạn báo thêm Cửa hàng trưởng). Việc quá
        hạn hơn 30 ngày không hiện — xem ở Đơn hàng › Quá hạn trả.
      </p>

      {completing && <CompleteDialog key={`${completing.order_id}-${completing.task_type}`} task={completing} me={me} onClose={() => setCompleting(null)} />}
    </div>
  );
}

function TaskRow({
  task: t,
  overdue,
  meId,
  branchChip,
  onComplete,
}: {
  task: BoardTask;
  overdue: boolean;
  meId: string;
  branchChip: React.ReactNode;
  onComplete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const claim = () =>
    startTransition(async () => {
      const res = await claimOrderStep(t.order_id, t.task_type);
      if ("error" in res) toast.error(res.error);
      else toast.success(`Đã nhận: ${t.order_code} · ${TASK_TYPE_LABELS[t.task_type]}`);
    });
  const mapHref = t.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.address)}` : null;

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/orders/${t.order_id}`} className="font-semibold text-primary hover:underline">
            {t.order_code}
          </Link>
          {branchChip}
          <span className="text-sm font-medium">{TASK_TYPE_LABELS[t.task_type]}</span>
          {overdue && <span className="rounded bg-rose-600 px-1.5 text-[10.5px] font-bold text-white">QUÁ HẠN</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {t.customer_name ?? "—"}
          {t.assignee_id && t.assignee_id !== meId && ` · ${t.assignee_name ?? "người khác"} nhận`}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:w-44 sm:flex-col sm:items-end sm:gap-0">
        <span className={cn("text-sm tabular-nums", overdue && "font-semibold text-rose-700 dark:text-rose-300")}>
          {dueFmt.format(new Date(t.due_at))}
        </span>
        <span className="text-[11px] text-muted-foreground">{DUE_RULE[t.task_type]}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {t.phone && (
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<a href={`tel:${t.phone}`} aria-label={`Gọi ${t.phone}`} />}>
            <Phone className="size-4" />
          </Button>
        )}
        {mapHref && (
          <Button
            variant="outline"
            size="icon-sm"
            nativeButton={false}
            render={<a href={mapHref} target="_blank" rel="noreferrer" aria-label="Mở bản đồ" />}
          >
            <MapPin className="size-4" />
          </Button>
        )}
        {!t.assignee_id && (
          <Button variant="outline" size="sm" onClick={claim} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />}
            Nhận
          </Button>
        )}
        <Button size="sm" onClick={onComplete} className="flex-1 sm:flex-none">
          <Check className="size-4" />
          Hoàn thành
        </Button>
      </div>
    </li>
  );
}

// Hoàn thành ngay từ danh sách: người làm = mình (ghi khoán khâu), vẫn có thu
// tiền ngay + cảnh báo nợ cần lý do như ở trang đơn.
function CompleteDialog({
  task,
  me,
  onClose,
}: {
  task: BoardTask;
  me: { id: string; name: string };
  onClose: () => void;
}) {
  const [checks, setChecks] = useState<StepChecks | null>(null);
  useEffect(() => {
    let alive = true;
    getStepChecksForOrder(task.order_id).then(
      (c) => alive && setChecks(c),
      () => alive && setChecks({ remaining: 0, depositDue: 0, missingCccd: false, hasOwingOverride: false }),
    );
    return () => {
      alive = false;
    };
  }, [task.order_id]);
  const paymentDefault =
    !checks
      ? null
      : task.task_type === "ky_hop_dong_thu_coc"
        ? { type: "deposit_collect" as const, amount: checks.depositDue }
        : (["giao_hang_ban_giao", "thu_hoi", "nghiem_thu", "nhap_kho_bao_tri"] as TaskType[]).includes(task.task_type)
          ? { type: "invoice" as const, amount: checks.remaining }
          : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {task.order_code} · {TASK_TYPE_LABELS[task.task_type]}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {task.customer_name ?? ""} — người làm: <b>{me.name}</b> (ghi khoán khâu này).
        </p>
        {checks ? (
          <StepCompleterBody
            orderId={task.order_id}
            steps={[{ taskType: task.task_type, employees: [me], assignedId: me.id }]}
            currentEmployeeId={me.id}
            checks={checks}
            paymentDefault={paymentDefault}
            submitLabel="Hoàn thành"
            onDone={onClose}
          />
        ) : (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang kiểm tra công nợ của đơn…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
