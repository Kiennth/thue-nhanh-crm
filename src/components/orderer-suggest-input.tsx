"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchOrderers, type OrdererSuggestion } from "@/lib/actions/orderers";

// Ô Tên / SĐT có gợi ý (CEO 2026-10-05 người đặt; 2026-10-09 dùng chung cho
// người nhận / người trả hàng): gõ ≥ 2 ký tự → hiện người trong danh bạ (người
// đặt + người từng nhận/trả hàng), chọn là điền (onPick).
export function OrdererSuggestInput({
  onPick,
  onValueChange,
  ...props
}: React.ComponentProps<typeof Input> & {
  onPick: (o: OrdererSuggestion) => void;
  onValueChange?: (v: string) => void;
}) {
  const [items, setItems] = useState<OrdererSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function lookup(v: string) {
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      const res = await searchOrderers(v);
      if (mine === seq.current) {
        setItems(res);
        setOpen(res.length > 0);
      }
    }, 250);
  }

  return (
    <div className="relative">
      <Input
        {...props}
        autoComplete="off"
        onChange={(e) => {
          props.onChange?.(e);
          onValueChange?.(e.target.value);
          lookup(e.target.value);
        }}
        onFocus={(e) => {
          props.onFocus?.(e);
          if (items.length) setOpen(true);
        }}
        onBlur={(e) => {
          props.onBlur?.(e);
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && items.length > 0 && (
        <ul className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-lg">
          <li className="px-2 py-1 text-[11px] text-muted-foreground">Người trong danh bạ — bấm để điền</li>
          {items.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                }}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="font-medium">{o.name}</span>
                <span className="text-muted-foreground">
                  {[o.phone, o.email].filter(Boolean).length ? ` · ${[o.phone, o.email].filter(Boolean).join(" · ")}` : ""}
                </span>
                {o.title && <span className="block text-xs text-muted-foreground">{o.title}</span>}
                {o.source === "receiver" && <span className="block text-xs text-muted-foreground">Từng nhận/trả hàng</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Form không điều khiển (defaultValue): điền thẳng 3 ô theo name trong form.
export function fillOrdererFields(from: HTMLElement | null, o: OrdererSuggestion) {
  const form = from?.closest("form");
  if (!form) return;
  const set = (name: string, value: string | null) => {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value ?? "";
  };
  set("orderer_name", o.name);
  set("orderer_phone", o.phone);
  set("orderer_email", o.email);
}
