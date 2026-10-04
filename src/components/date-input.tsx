"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Ô ngày luôn hiện Ngày/Tháng/Năm (CEO 2026-10-04). <input type="date"> gốc
// hiện theo NGÔN NGỮ TRÌNH DUYỆT — Chrome tiếng Anh ra mm/dd/yyyy, không ép
// được bằng lang="vi". Ô này cho gõ dd/mm/yyyy, nút lịch bên phải mở bộ chọn
// ngày gốc; giá trị trả ra vẫn là "YYYY-MM-DD" như input gốc (name → ô ẩn
// gửi kèm form, onChange nhận { target: { value } }) nên thay thẳng được.

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
  const nativeRef = useRef<HTMLInputElement>(null);

  function commit(next: string) {
    setShownIso(next);
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next } });
  }

  function handleType(raw: string) {
    let next = raw.replace(/[^\d/.-]/g, "").slice(0, 10);
    // Gõ liền số thì tự chèn "/" sau ngày và tháng.
    if (next.length > text.length && /^\d{2}$|^\d{1,2}\/\d{2}$/.test(next)) next += "/";
    setText(next);
    if (!next) commit("");
    else {
      const parsed = parseDisplay(next);
      if (parsed) commit(parsed);
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
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
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setText(toDisplay(e.target.value));
          commit(e.target.value);
        }}
        className="pointer-events-none absolute right-0 bottom-0 h-full w-8 opacity-0"
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Chọn ngày trên lịch"
        onClick={() => {
          const el = nativeRef.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="size-4" />
      </button>
      {name && <input type="hidden" name={name} value={iso} />}
    </div>
  );
}
