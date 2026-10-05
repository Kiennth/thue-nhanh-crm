"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveShift, deleteShift } from "@/lib/actions/work-shifts";
import { JOB_ICONS, JOB_LABELS, SHIFT_PRESETS, shiftClass, type JobKind, type ShiftKind } from "@/lib/shift-presets";
import { cn } from "@/lib/utils";

export interface GridEmployee {
  id: string;
  name: string;
  roleLabel: string;
  branchId: string | null;
  canEdit: boolean;
}
export interface GridGroup {
  key: string;
  label: string;
  color: string | null; // CSS var, vd "--chart-1"
  employees: GridEmployee[];
}
export interface GridDay {
  date: string;
  label: string; // "06/10"
  weekday: string; // "T2"
  isToday: boolean;
}
export interface GridShift {
  id: string;
  employee_id: string;
  shift_date: string;
  kind: ShiftKind;
  label: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}
export interface GridJob {
  employeeId: string;
  date: string;
  time: string;
  kind: JobKind;
  orderId: string;
  orderCode: string;
  customer: string;
}

const TIMES = Array.from({ length: 38 }, (_, i) => {
  const m = 5 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

type Editing = { employee: GridEmployee; date: string; shift: GridShift | null };

// Bảng lịch làm việc theo tuần (CEO 2026-10-05): hàng = nhân viên (nhóm theo
// kho), cột = ngày; ca trực + việc được giao trong từng ô. Bấm ô để xếp ca.
export function ScheduleGrid({
  groups,
  days,
  shifts,
  jobs,
}: {
  groups: GridGroup[];
  days: GridDay[];
  shifts: GridShift[];
  jobs: GridJob[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const shiftsAt = (empId: string, date: string) => shifts.filter((s) => s.employee_id === empId && s.shift_date === date);
  const jobsAt = (empId: string, date: string) => jobs.filter((j) => j.employeeId === empId && j.date === date);
  const tint = (c: string | null, pct: number) => `color-mix(in srgb, var(${c ?? "--muted-foreground"}) ${pct}%, transparent)`;

  return (
    <>
      <div className="w-full overflow-x-auto rounded-xl border bg-background [contain:inline-size]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-48 border-b bg-background px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">
                Nhân viên
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={cn(
                    "border-b border-l px-2 py-2 text-center",
                    d.isToday && "bg-primary/10 text-primary",
                    (d.weekday === "T7" || d.weekday === "CN") && !d.isToday && "bg-muted/50",
                  )}
                >
                  <div className="text-[11px] text-muted-foreground">{d.weekday}</div>
                  <div className="font-bold tabular-nums">{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr style={{ backgroundColor: tint(g.color, 22) }}>
                  <td
                    colSpan={days.length + 1}
                    className="border-l-4 px-3 py-1.5 text-sm font-bold"
                    style={{ borderLeftColor: `var(${g.color ?? "--muted-foreground"})` }}
                  >
                    {g.label} <span className="font-normal text-muted-foreground">· {g.employees.length} người</span>
                  </td>
                </tr>
                {g.employees.map((emp) => (
                  <tr key={emp.id} className="align-top">
                    <td
                      className="sticky left-0 z-10 border-b border-l-4 bg-background px-3 py-2"
                      style={{ borderLeftColor: `var(${g.color ?? "--muted-foreground"})` }}
                    >
                      <p className="font-semibold">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.roleLabel}</p>
                    </td>
                    {days.map((d) => {
                      const cellShifts = shiftsAt(emp.id, d.date);
                      const cellJobs = jobsAt(emp.id, d.date);
                      return (
                        <td
                          key={d.date}
                          className={cn("group relative h-16 border-b border-l p-1.5", d.isToday && "bg-primary/5")}
                        >
                          <div className="space-y-1">
                            {cellShifts.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                disabled={!emp.canEdit}
                                onClick={() => setEditing({ employee: emp, date: d.date, shift: s })}
                                title={s.note ?? undefined}
                                className={cn(
                                  "block w-full rounded-md px-1.5 py-1 text-left text-xs font-semibold ring-1 disabled:cursor-default",
                                  shiftClass(s.label, s.kind),
                                )}
                              >
                                {s.label}
                                {s.start_time && (
                                  <span className="block font-normal tabular-nums opacity-80">
                                    {hm(s.start_time)}–{hm(s.end_time)}
                                  </span>
                                )}
                              </button>
                            ))}
                            {cellJobs.map((j, i) => (
                              <Link
                                key={`${j.orderId}-${j.kind}-${i}`}
                                href={`/orders/${j.orderId}`}
                                title={`${JOB_LABELS[j.kind]} ${j.orderCode} · ${j.customer}`}
                                className="block truncate rounded-md border border-dashed px-1.5 py-0.5 text-[11px] hover:border-primary"
                              >
                                {JOB_ICONS[j.kind]} {j.time} {JOB_LABELS[j.kind]} {j.orderCode}
                              </Link>
                            ))}
                          </div>
                          {emp.canEdit && (
                            <button
                              type="button"
                              onClick={() => setEditing({ employee: emp, date: d.date, shift: null })}
                              className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                              aria-label={`Thêm ca cho ${emp.name} ngày ${d.label}`}
                            >
                              <Plus className="size-4" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ShiftDialog key={`${editing.employee.id}-${editing.date}-${editing.shift?.id ?? "new"}`} editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ShiftDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const s = editing.shift;
  const [label, setLabel] = useState(s?.label ?? SHIFT_PRESETS[0].label);
  const [kind, setKind] = useState<ShiftKind>(s?.kind ?? "work");
  const [start, setStart] = useState(hm(s?.start_time ?? null) ?? SHIFT_PRESETS[0].start!);
  const [end, setEnd] = useState(hm(s?.end_time ?? null) ?? SHIFT_PRESETS[0].end!);
  const [note, setNote] = useState(s?.note ?? "");
  const [pending, startT] = useTransition();
  const dmy = editing.date.split("-").reverse().join("/");

  const run = (fn: () => Promise<{ error: string } | { success: true }>, ok: string) =>
    startT(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(ok);
        onClose();
      }
    });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {s ? "Sửa ca" : "Xếp ca"} · {editing.employee.name} · {dmy}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {SHIFT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setLabel(p.label);
                setKind(p.kind);
                if (p.start) setStart(p.start);
                if (p.end) setEnd(p.end);
              }}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1",
                p.className,
                label === p.label && "ring-2 ring-primary",
              )}
            >
              {p.label}
              {p.start && <span className="ml-1 font-normal opacity-75">{p.start}–{p.end}</span>}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shift_label">Tên ca</Label>
          <Input id="shift_label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        </div>
        {kind === "work" && (
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Bắt đầu", start, setStart],
                ["Kết thúc", end, setEnd],
              ] as const
            ).map(([lbl, val, set]) => (
              <div key={lbl} className="space-y-1.5">
                <Label>{lbl}</Label>
                <select
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-2 text-sm tabular-nums"
                >
                  {(TIMES.includes(val) ? TIMES : [val, ...TIMES]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="shift_note">Ghi chú</Label>
          <Input id="shift_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: trực sự kiện ở Q7" />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {s ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => deleteShift(s.id), "Đã xoá ca")}
              className="text-destructive"
            >
              <Trash2 className="size-4" /> Xoá ca
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={pending || !label.trim()}
            onClick={() =>
              run(
                () =>
                  saveShift(s?.id ?? null, {
                    employee_id: editing.employee.id,
                    shift_date: editing.date,
                    kind,
                    label: label.trim(),
                    start_time: kind === "work" ? start : null,
                    end_time: kind === "work" ? end : null,
                    note: note.trim() || null,
                  }),
                s ? "Đã sửa ca" : "Đã xếp ca",
              )
            }
          >
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
