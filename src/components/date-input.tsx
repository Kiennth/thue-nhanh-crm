"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Ô ngày luôn hiện Ngày/Tháng/Năm (CEO 2026-10-04). <input type="date"> gốc
// hiện theo NGÔN NGỮ TRÌNH DUYỆT — Chrome tiếng Anh ra mm/dd/yyyy và lịch bắt
// đầu Chủ nhật, không ép được bằng lang="vi". Ô này cho gõ dd/mm/yyyy, nút
// lịch bên phải mở bảng lịch riêng (tuần bắt đầu Thứ 2 — CEO 2026-10-04);
// giá trị trả ra vẫn là "YYYY-MM-DD" như input gốc (name → ô ẩn gửi kèm
// form, onChange nhận { target: { value } }) nên thay thẳng được.

type DateInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
};

function toDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function parseDisplay(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DateInput({
  value,
  defaultValue,
  onChange,
  name,
  className,
  min,
  max,
  disabled,
  onBlur,
  ...rest
}: DateInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = (controlled ? value : inner) ?? "";
  const [text, setText] = useState(toDisplay(iso));
  // Giá trị đổi từ ngoài (form reset, chọn preset...) → cập nhật chữ hiển thị.
  const [shownIso, setShownIso] = useState(iso);
  if (iso !== shownIso) {
    setShownIso(iso);
    setText(toDisplay(iso));
  }
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Bấm ra ngoài / Esc thì đóng bảng lịch.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function commit(next: string) {
    setShownIso(next);
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next } });
  }

  function handleType(raw: string) {
    let next = raw.replace(/[^\d/.-]/g, "");
    // Gõ/dán liền số ("15092026") thì tự chèn "/" sau ngày và tháng.
    if (/^\d+$/.test(next) && next.length > 2) {
      const d = next.slice(0, 8);
      next = `${d.slice(0, 2)}/${d.slice(2, 4)}${d.length > 4 ? `/${d.slice(4)}` : ""}`;
    } else if (next.length > text.length && /^\d{2}$|^\d{1,2}\/\d{2}$/.test(next)) next += "/";
    next = next.slice(0, 10);
    setText(next);
    if (!next) commit("");
    else {
      const parsed = parseDisplay(next);
      if (parsed) commit(parsed);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <Input
        {...rest}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        autoComplete="off"
        disabled={disabled}
        value={text}
        onChange={(e) => handleType(e.target.value)}
        onBlur={(e) => {
          // Gõ dở/sai thì trả lại ngày đang có.
          if (text && !parseDisplay(text)) setText(toDisplay(iso));
          else if (parseDisplay(text)) setText(toDisplay(parseDisplay(text)!));
          onBlur?.(e);
        }}
        className="w-full pr-8 tabular-nums"
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Chọn ngày trên lịch"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="size-4" />
      </button>
      {open && (
        <CalendarPanel
          value={iso}
          min={typeof min === "string" ? min : undefined}
          max={typeof max === "string" ? max : undefined}
          onPick={(d) => {
            setText(toDisplay(d));
            commit(d);
            setOpen(false);
          }}
        />
      )}
      {name && <input type="hidden" name={name} value={iso} />}
    </div>
  );
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

// Bảng lịch tháng, tuần bắt đầu Thứ 2. Tính ngày trên UTC thuần (chuỗi
// YYYY-MM-DD) nên không lệch múi giờ.
function CalendarPanel({
  value,
  min,
  max,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
}) {
  const today = todayIso();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Thứ 2 = 0
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + n, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  return (
    <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="rounded p-1 hover:bg-muted" aria-label="Tháng trước">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">
          Tháng {view.m + 1}, {view.y}
        </span>
        <button type="button" onClick={() => shift(1)} className="rounded p-1 hover:bg-muted" aria-label="Tháng sau">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w} className={cn("py-1", w === "CN" && "text-red-500")}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const iso = isoOf(view.y, view.m, d);
          const blocked = (min && iso < min) || (max && iso > max);
          return (
            <button
              key={iso}
              type="button"
              disabled={!!blocked}
              onClick={() => onPick(iso)}
              className={cn(
                "h-8 rounded text-sm tabular-nums hover:bg-muted disabled:opacity-30",
                i % 7 === 6 && "text-red-500",
                iso === today && "font-bold ring-1 ring-primary/50",
                iso === value && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between border-t pt-1">
        <button
          type="button"
          onClick={() => onPick(today)}
          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
        >
          Hôm nay
        </button>
      </div>
    </div>
  );
}
